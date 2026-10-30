#!/usr/bin/env node
// session-log-decode.mjs — frame-by-frame decoder for a concatenated-Zstandard
// DSH session log (e.g. session.v4.jsonl.zstd).
//
// Why frame-by-frame: the persistence layer appends one independent zstd frame per
// flush/generation to the same file. The bytes of an older generation therefore stay
// byte-identical for ever (append-only, no rewrite), while a later generation can hold
// a clean copy of the same text. Only per-frame decode can say *which generation*
// stored a given record and recover the exact stored text of the corrupt one.
//
// READ-ONLY: never writes, never repairs, never rewrites the log. Copy first if the
// host is running (the file is being appended to).
//
// Usage:
//   node session-log-decode.mjs <log.zstd> [--find <regex>] [--context N] [--json]
//
// Exit codes: 0 ok, 2 argument/file error, 3 frame parse error.

import { readFileSync } from 'node:fs';
import { zstdDecompressSync } from 'node:zlib';

const ZSTD_MAGIC = 0xfd2fb528;       // 28 B5 2F FD
const SKIPPABLE_MIN = 0x184d2a50;    // 50 2A 4D 18 .. 5F
const SKIPPABLE_MAX = 0x184d2a5f;

/** Walk the container sequentially (no magic-search) and return frame extents. */
export function splitFrames(buf) {
  const frames = [];
  let off = 0;
  while (off + 4 <= buf.length) {
    const magic = buf.readUInt32LE(off);
    if (magic >= SKIPPABLE_MIN && magic <= SKIPPABLE_MAX) {
      if (off + 8 > buf.length) throw new Error('truncated skippable frame header at ' + off);
      const size = buf.readUInt32LE(off + 4);
      if (off + 8 + size > buf.length) throw new Error('truncated skippable payload at ' + off);
      frames.push({ index: frames.length, offset: off, length: 8 + size, kind: 'skippable' });
      off += 8 + size;
      continue;
    }
    if (magic !== ZSTD_MAGIC) throw new Error('bad magic 0x' + magic.toString(16) + ' at offset ' + off);

    const fhd = buf[off + 4];
    if (fhd === undefined) throw new Error('truncated frame header descriptor at ' + off);
    const fcsFlag = fhd >> 6;
    const singleSegment = (fhd >> 5) & 1;
    const checksum = (fhd >> 2) & 1;
    const dictFlag = fhd & 3;

    let p = off + 5;
    if (!singleSegment) p += 1;                       // Window_Descriptor
    p += [0, 1, 2, 4][dictFlag];                      // Dictionary_ID
    p += [singleSegment ? 1 : 0, 2, 4, 8][fcsFlag];    // Frame_Content_Size

    for (;;) {
      if (p + 3 > buf.length) throw new Error('truncated block header at ' + p);
      const bh = buf[p] | (buf[p + 1] << 8) | (buf[p + 2] << 16);
      const last = bh & 1;
      const type = (bh >> 1) & 3;
      const size = bh >> 3;
      p += 3;
      if (type === 3) throw new Error('reserved block type at ' + (p - 3));
      if (type === 1) p += 1;                          // RLE: one byte
      else p += size;                                  // raw / compressed
      if (p > buf.length) throw new Error('truncated block payload at ' + p);
      if (last) break;
    }
    if (checksum) p += 4;
    if (p > buf.length) throw new Error('truncated content checksum at ' + p);
    frames.push({ index: frames.length, offset: off, length: p - off, kind: 'zstd' });
    off = p;
  }
  if (off !== buf.length) throw new Error('trailing bytes after last frame: ' + (buf.length - off));
  return frames;
}

function decode(buf, frames) {
  return frames.map((f) => {
    const slice = buf.subarray(f.offset, f.offset + f.length);
    if (f.kind === 'skippable') return { ...f, text: '' };
    const raw = zstdDecompressSync(slice);
    return { ...f, text: raw.toString('utf8') };
  });
}

function main(argv) {
  const file = argv[2];
  if (!file) { console.error('usage: session-log-decode.mjs <log.zstd> [--find re] [--context N]'); return 2; }
  const findIdx = argv.indexOf('--find');
  const ctxIdx = argv.indexOf('--context');
  const re = findIdx > 0 ? new RegExp(argv[findIdx + 1]) : null;
  const ctx = ctxIdx > 0 ? Number(argv[ctxIdx + 1]) : 3;

  let buf;
  try { buf = readFileSync(file); } catch (e) { console.error('cannot read: ' + e.message); return 2; }

  let frames;
  try { frames = splitFrames(buf); } catch (e) { console.error('frame parse failed: ' + e.message); return 3; }
  const decoded = decode(buf, frames);

  let totalRecords = 0;
  for (const f of decoded) {
    if (f.kind === 'skippable') { console.log('# frame ' + f.index + ' skippable ' + f.length + 'B'); continue; }
    const lines = f.text.split('\n').filter((l) => l.trim() !== '');
    totalRecords += lines.length;
    console.log('# frame ' + f.index + ' (generation) offset=' + f.offset + ' compressed=' + f.length +
      'B records=' + lines.length);
    if (!re) continue;
    lines.forEach((line, i) => {
      if (!re.test(line)) return;
      console.log('  --- frame ' + f.index + ' record ' + (i + 1) + ' ---');
      for (let k = Math.max(0, i - ctx); k <= Math.min(lines.length - 1, i + ctx); k++) {
        console.log('  ' + (k + 1) + ': ' + lines[k]);
      }
    });
  }
  console.log('# ' + frames.length + ' frame(s), ' + totalRecords + ' record line(s)');
  return 0;
}

if (import.meta.main) process.exit(main(process.argv));
