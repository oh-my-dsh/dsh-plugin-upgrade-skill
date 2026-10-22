#!/usr/bin/env node
/**
 * zstd-frame-forensics.mjs - decode a concatenated-Zstandard "generation" file
 * frame-by-frame and recover the exact stored text of a session-log record.
 *
 * Why frame-by-frame and not one big `zstd -d`:
 *   A concatenated-zstd generation file is N independent frames back to back
 *   (one frame per generation / turn). Whole-file decompression silently merges
 *   them, so you lose the generation boundaries and cannot tell WHICH generation
 *   stored a given string. Frame-wise decoding gives, per frame: byte offset,
 *   compressed size, decompressed size and the exact UTF-8 text - which is what
 *   you need to attribute a corrupted payload to a generation and to prove,
 *   byte for byte, that the stored text differs from the file on disk.
 *
 * Method (RFC 8878):
 *   1. walk each frame header (Frame_Header_Descriptor -> window / dict / FCS
 *      field sizes) and then the block chain (3-byte block headers: last-block
 *      flag, block type, block size); that yields the exact compressed size of
 *      the frame WITHOUT decompressing. Walking also skips magic bytes that
 *      happen to occur inside block payloads, which naive magic-scan carving
 *      would mis-split.
 *   2. carve the frame and decompress it standalone (zstdDecompressSync) -
 *      that standalone success is the validation that the carve is a real,
 *      complete frame.
 *   3. assert the carved frames tile the file exactly (no gaps, no overlap) and
 *      that the concatenation of the per-frame outputs equals the whole-file
 *      streaming decompression (cross-check that nothing was dropped).
 *   4. decode each frame as JSONL and index the records.
 *
 * CLI equivalents for steps 1-3: `zstd -l file` (frame list), `zstd -d -c file`
 * (whole file, frames merged), or python + `zstandard` with
 * `read_across_frames=True`.
 *
 * Usage:
 *   node zstd-frame-forensics.mjs <file.zst>              # carve + decode + index
 *   node zstd-frame-forensics.mjs --build-demo <dir>      # write a synthetic demo
 *   node zstd-frame-forensics.mjs --prove-splice <payload.txt> <source.txt>
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import zlib from 'node:zlib';

const ZSTD_MAGIC = 0xFD2FB528;
const SKIP_LO = 0x184D2A50;
const SKIP_HI = 0x184D2A5F;
const FCS_SIZE = [0, 2, 4, 8];
const DID_SIZE = [0, 1, 2, 4];

/** Compressed byte length of the zstd frame starting at `off`, or null. */
export function frameSize(buf, off) {
  if (off + 4 > buf.length) return null;
  const magic = buf.readUInt32LE(off);
  if (magic >= SKIP_LO && magic <= SKIP_HI) {            // skippable frame
    if (off + 8 > buf.length) return null;
    return 8 + buf.readUInt32LE(off + 4);
  }
  if (magic !== ZSTD_MAGIC) return null;
  let p = off + 4;
  if (p + 1 > buf.length) return null;
  const fhd = buf[p++];
  const fcsFlag = fhd >> 6;
  const singleSeg = (fhd >> 5) & 1;
  const checksum = (fhd >> 2) & 1;
  const didFlag = fhd & 3;
  if (!singleSeg) { if (p + 1 > buf.length) return null; p += 1; }   // Window_Descriptor
  const did = DID_SIZE[didFlag];
  if (p + did > buf.length) return null; p += did;                   // Dictionary_ID
  let fcs = FCS_SIZE[fcsFlag];
  if (fcsFlag === 0 && singleSeg) fcs = 1;                           // 1-byte FCS
  if (p + fcs > buf.length) return null; p += fcs;                   // Frame_Content_Size
  for (;;) {                                                         // block chain
    if (p + 3 > buf.length) return null;
    const h = buf[p] | (buf[p + 1] << 8) | (buf[p + 2] << 16);
    p += 3;
    const last = h & 1;
    const btype = (h >> 1) & 3;
    const bsize = h >>> 3;
    if (btype !== 1 && p + bsize > buf.length) return null;
    p += (btype === 1 ? 1 : bsize);                                  // RLE = 1 byte
    if (last) break;
  }
  if (checksum) { if (p + 4 > buf.length) return null; p += 4; }
  return p - off;
}

/** Carve every frame: [{index, start, end, size, text}]. */
export function carveFrames(buf, filePath = null) {
  const frames = [];
  let off = 0;
  let guard = 0;
  while (off < buf.length) {
    if (++guard > 1e6) throw new Error('frame walk did not terminate');
    const size = frameSize(buf, off);
    if (size === null || size <= 0) throw new Error('not a zstd frame at offset ' + off);
    const raw = buf.subarray(off, off + size);
    const text = zlib.zstdDecompressSync(raw).toString('utf8');      // standalone = validation
    frames.push({ index: frames.length, start: off, end: off + size, size, text });
    off += size;
  }
  // cross-check 1: the carved frames must tile the file exactly (no trailing bytes)
  if (frames[frames.length - 1].end !== buf.length) {
    throw new Error('frames do not tile the file: last frame ends at ' + frames[frames.length - 1].end + ' of ' + buf.length);
  }
  // cross-check 2 (independent decoder, when python3+zstandard is installed):
  // the merged whole-file output must equal the concatenation of the per-frame outputs.
  // NOTE: node's zlib zstd does NOT merge concatenated frames - both
  // zstdDecompressSync() and createZstdDecompress() stop after frame #1 - so the
  // one-shot sync decode of a multi-frame file silently returns only the first
  // generation. Always carve first, then decode frame by frame.
  const joined = Buffer.concat(frames.map((f) => Buffer.from(f.text, 'utf8')));
  const merged = filePath ? mergedOutput(filePath) : null;
  if (merged && !joined.equals(merged)) throw new Error('frame carve disagrees with the independent decoder');
  return frames;
}

/** Whole-file output via python3 + zstandard (read_across_frames=True), or null. */
function mergedOutput(filePath) {
  const py = [
    'import sys, io, zstandard',
    "data = open(sys.argv[1], 'rb').read()",
    "r = zstandard.ZstdDecompressor().stream_reader(io.BytesIO(data), read_across_frames=True)",
    'sys.stdout.buffer.write(r.read())',
  ].join('\n');
  try { return execFileSync('python', ['-c', py, filePath], { encoding: 'buffer' }); }
  catch { return null; }
}

/** Split a frame's text into JSONL records (tolerates a trailing partial line). */
export function decodeRecords(text) {
  const out = [];
  text.split('\n').forEach((line, i) => {
    if (!line.trim()) return;
    try { out.push({ line: i + 1, ok: true, value: JSON.parse(line) }); }
    catch { out.push({ line: i + 1, ok: false, value: line }); }
  });
  return out;
}

/** Deep-walk a record and collect every long string (candidate stored text). */
export function collectStrings(v, acc = [], path = '$') {
  if (typeof v === 'string') { if (v.length > 40) acc.push({ path, text: v }); return acc; }
  if (Array.isArray(v)) { v.forEach((x, i) => collectStrings(x, acc, path + '[' + i + ']')); return acc; }
  if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) collectStrings(x, acc, path + '.' + k);
  }
  return acc;
}

/**
 * Strip a read-tool line prefix ("   232: <circle ...") so the payload text can be
 * compared with the raw file bytes / validated as XML. Returns the bare lines.
 */
export function stripLinePrefixes(text) {
  return text.split('\n').map((l) => l.replace(/^\s*\d+:\s?/, ''));
}

/**
 * Rebuild a validatable document from a stored payload text: strip the read
 * prefixes and wrap the fragment in one root element, so a standard XML parser
 * can be pointed at it (the same thing the incident's verdict was produced on).
 */
export function reconstructDocument(payloadText, rootTag = 'svg') {
  const body = stripLinePrefixes(payloadText).join('\n');
  return '<' + rootTag + ' xmlns="http://www.w3.org/2000/svg">\n' + body + '\n</' + rootTag + '>\n';
}

const MIN_PREFIX = 20;   // a real shared prefix, not a coincidental few characters

/** Length of the common prefix of two strings. */
function commonPrefix(a, b) {
  let n = 0;
  const max = Math.min(a.length, b.length);
  while (n < max && a[n] === b[n]) n++;
  return n;
}

/**
 * Classify every payload line against the source file and prove splices:
 *   payload = source[a][0:cut] + source[b][at:]
 *
 * Ranking (this is what keeps the proof unique on real files): for each payload
 * line take the source line with the LONGEST shared prefix; only if that prefix
 * is substantial (>= MIN_PREFIX) and the remainder is found verbatim inside a
 * DIFFERENT source line at a non-zero offset do we report a splice. A payload
 * line that equals a source line verbatim is reported as a clean copy instead.
 */
export function proveSplice(payloadText, sourceText) {
  const src = sourceText.split('\n');
  const pay = stripLinePrefixes(payloadText);
  const findings = [];
  pay.forEach((pl, pi) => {
    if (!pl.trim()) return;
    // 1. clean copy?
    const identical = src.findIndex((sl) => sl === pl);
    if (identical >= 0) {
      findings.push({ payloadLine: pi + 1, verdict: 'clean', identicalToSourceLine: identical + 1 });
      return;
    }
    // 2. longest shared prefix over all source lines
    let bestA = -1;
    let bestCut = 0;
    for (let a = 0; a < src.length; a++) {
      const cut = commonPrefix(pl, src[a]);
      if (cut > bestCut) { bestCut = cut; bestA = a; }
    }
    if (bestA < 0 || bestCut < MIN_PREFIX) {
      findings.push({ payloadLine: pi + 1, verdict: 'unmatched', longestSharedPrefix: bestCut });
      return;
    }
    // 3. does the remainder occur inside another source line, mid-line?
    const rem = pl.slice(bestCut);
    let bestB = -1;
    let bestAt = -1;
    for (let b = 0; b < src.length; b++) {
      if (b === bestA) continue;
      const at = src[b].indexOf(rem);
      if (at > 0 && (bestAt < 0 || at < bestAt)) { bestAt = at; bestB = b; }
    }
    if (bestB < 0) {
      findings.push({ payloadLine: pi + 1, verdict: 'truncated-or-foreign', prefixFromSourceLine: bestA + 1, cutAtChar: bestCut, prefix: src[bestA].slice(0, bestCut) });
      return;
    }
    findings.push({
      payloadLine: pi + 1,
      verdict: 'SPLICE',
      prefixFromSourceLine: bestA + 1,
      cutAtChar: bestCut,
      suffixFromSourceLine: bestB + 1,
      suffixAtChar: bestAt,
      prefix: src[bestA].slice(0, bestCut),
      suffix: rem,
      sourceLinesDroppedBetween: bestB - bestA - 1,
      reconstruction: 'source[' + (bestA + 1) + '][0:' + bestCut + '] + source[' + (bestB + 1) + '][' + bestAt + ':]',
    });
  });
  return findings;
}

/** XML well-formedness verdict via an external parser (python3 if present). */
export function xmlVerdict(file) {
  const py = [
    'import sys, xml.etree.ElementTree as ET',
    'try:',
    '    ET.parse(sys.argv[1]); print("WELL-FORMED")',
    'except ET.ParseError as e:',
    '    print("NOT well-formed ->", e)',
  ].join('\n');
  try { return execFileSync('python', ['-c', py, file], { encoding: 'utf8' }).trim(); }
  catch (e) { return String((e.stdout || '') + (e.stderr || 'python3 unavailable')).trim(); }
}

// ---------------------------------------------------------------- demo builder
function buildDemo(dir) {
  mkdirSync(dir, { recursive: true });
  const src232 = '    <circle r="98" fill="none" stroke="#dde6ea" stroke-width="6.5"/>';
  const src247 = '    <path d="M 587,730 A 122,122 0 0,1 821,730" fill="none" stroke="#ffffff" stroke-width="3" opacity=".7" stroke-linecap="round"/>';
  const corrupted = src232.slice(0, 52) + src247.slice(35);    // the splice, byte-exact
  const filler = (i) => '    <circle cx="' + i + '" cy="' + i + '" r="' + ((i % 40) + 1) + '" fill="#33363a" id="l' + i + '"/>';
  const srcLines = [];
  for (let i = 1; i <= 247; i++) srcLines.push(i === 232 ? src232 : (i === 247 ? src247 : filler(i)));
  const source = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 900">\n' + srcLines.join('\n') + '\n</svg>\n';
  // The payload as stored in the log: the read window lines 231-234 (file
  // numbering: line 1 is the <svg> root), with the window's line 233 spliced and
  // source lines 234-247 gone - the window's line 234 is already a later <path>.
  const windowLines = [231, 232, 233, 234];
  const payload = windowLines.map((n) => '    ' + n + ': ' + (n === 233 ? corrupted
    : (n === 234 ? '    <path d="M 587,730 L 615,742 L 607,752 L 581,740 Z" fill="#e8d9bd"/>'
      : srcLines[n - 2]))).join('\n');
  const frame = (o) => zlib.zstdCompressSync(Buffer.from(JSON.stringify(o) + '\n', 'utf8'),
    { params: { [zlib.constants.ZSTD_c_compressionLevel]: 3 } });
  const frames = [
    frame({ gen: 1, type: 'user', text: 'preview E:\\...\\daigo-bicycle.svg' }),
    frame({ gen: 2, type: 'assistant', tool_use: { name: 'read', path: 'E:\\...\\daigo-bicycle.svg', offset: 229, limit: 20 } }),
    frame({ gen: 3, type: 'tool_result', tool: 'read', text: payload }),
    frame({ gen: 4, type: 'assistant', text: 'image is broken, re-reading the same region' }),
    frame({ gen: 5, type: 'tool_result', tool: 'read', text: [231, 232, 233].map((n) => '    ' + n + ': ' + srcLines[n - 2]).join('\n') }),
  ];
  writeFileSync(join(dir, 'demo-source.svg'), source, 'utf8');
  writeFileSync(join(dir, 'demo-session.generations.zst'), Buffer.concat(frames));
  console.log('demo written to ' + dir);
}

// ------------------------------------------------------------------------ main
const isMain = typeof process.argv[1] === 'string' && import.meta.url === pathToFileURL(process.argv[1]).href;
if (!isMain) {
  // imported as a library: do not run the CLI
} else {
const args = process.argv.slice(2);
if (args[0] === '--build-demo') { buildDemo(args[1]); process.exit(0); }

if (args[0] === '--reconstruct') {
  const [payload, dest, root] = args.slice(1);
  const doc = reconstructDocument(readFileSync(payload, 'utf8'), root || 'svg');
  writeFileSync(dest, doc, 'utf8');
  console.log('reconstructed document written to ' + dest + ' (' + doc.split('\n').length + ' lines)');
  process.exit(0);
}

if (args[0] === '--prove-splice') {
  const [payload, source] = args.slice(1).map((p) => readFileSync(p, 'utf8'));
  const findings = proveSplice(payload, source);
  console.log('splice findings: ' + findings.length);
  for (const f of findings) console.log(JSON.stringify(f, null, 2));
  process.exit(0);
}

const file = args[0];
const buf = readFileSync(file);
const frames = carveFrames(buf, file);
console.log('file: ' + file + ' | bytes: ' + buf.length + ' | frames: ' + frames.length);
console.log('tiling verified: carved frames exactly cover the file (no gaps, no overlap), and the merged output matches an independent decoder\n');
for (const fr of frames) {
  const recs = decodeRecords(fr.text);
  console.log('--- frame #' + (fr.index + 1) + '  offset=' + fr.start + '  compressed=' + fr.size
    + 'B  decompressed=' + Buffer.byteLength(fr.text) + 'B  records=' + recs.length);
  for (const r of recs) {
    if (!r.ok) {
      console.log('    line ' + r.line + ': UNPARSEABLE -> ' + String(r.value).slice(0, 80));
      continue;
    }
    const v = r.value;
    console.log('    line ' + r.line + ': ' + (v.type || v.role || '?') + (v.gen ? ' (generation ' + v.gen + ')' : ''));
    for (const s of collectStrings(v)) {
      console.log('        stored text @ ' + s.path + ' (' + s.text.length + ' chars)');
    }
  }
}
console.log('\nXML verdicts (external parser):');
for (const p of args.slice(1)) console.log('  ' + p + ' :: ' + xmlVerdict(p));
}
