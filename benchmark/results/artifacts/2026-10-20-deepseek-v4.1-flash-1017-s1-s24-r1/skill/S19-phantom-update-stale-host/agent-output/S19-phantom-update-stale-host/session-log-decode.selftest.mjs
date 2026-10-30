#!/usr/bin/env node
// session-log-decode.selftest.mjs — proves the frame-by-frame decoder on a synthetic
// concatenated-zstd log that reproduces the S19 shape: generation 1 stores a spliced
// read-result record, a later generation stores the clean re-read of the same region.
// Writes only inside this directory and removes its own temp file.
import { writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { zstdCompressSync, zstdDecompressSync } from 'node:zlib';
import { splitFrames } from './session-log-decode.mjs';

const dir = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const tmp = dir + 'selftest.log.zstd';

const svg = (variant) => {
  const l = [];
  for (let n = 1; n <= 260; n++) l.push('    <line n="' + n + '"/>');
  if (variant === 'clean') {
    l[231] = '    <circle r="98" fill="none" stroke="#dde6ea" stroke-width="6.5"/>';
    l[232] = '    <circle r="92" fill="none" stroke="#ffffff" stroke-width="2.4" opacity=".5"/>';
    l[246] = '    <path d="M 587,730 A 122,122 0 0,1 821,730" fill="none" stroke="#ffffff" stroke-width="3"/>';
  } else {
    // the S19 splice: source 232 cut at the shared prefix "stro" + source 247 tail
    l[231] = '    <circle r="98" fill="none" stroke="#dde6ea" stro0,1 821,730" fill="none" stroke="#ffffff" stroke-width="3"/>';
    l[232] = '    <path d="M 587,730 L 615,742 L 607,752 L 581,740 Z" fill="#e8d9bd"/>';
  }
  return l.join('\n');
};

const rec = (kind, id, text) => JSON.stringify({ kind, seq: id, payload: { text } });

// generation 1 (corrupt stored text) + generation 2 (clean re-read) + generation 3 (heartbeat)
const gen1 = [rec('turn/start', 1, 'reading svg'), rec('tool/result', 2, svg('corrupt')), rec('turn/end', 3, 'ok')].join('\n') + '\n';
const gen2 = [rec('tool/result', 4, svg('clean')), rec('note', 5, 're-read clean')].join('\n') + '\n';
const gen3 = [rec('session/heartbeat', 6, 'alive')].join('\n') + '\n';

const skippable = (() => { const b = Buffer.alloc(8 + 5); b.writeUInt32LE(0x184d2a5f, 0); b.writeUInt32LE(5, 4); b.write('dsh!!', 8); return b; })();
const log = Buffer.concat([zstdCompressSync(Buffer.from(gen1)), skippable, zstdCompressSync(Buffer.from(gen2)), zstdCompressSync(Buffer.from(gen3))]);
writeFileSync(tmp, log);

const frames = splitFrames(readFileSync(tmp));
const okFrames = frames.length === 4 &&
  frames[0].kind === 'zstd' && frames[1].kind === 'skippable' &&
  frames.map((f) => f.offset + f.length).at(-1) === log.length;

// round-trip each frame independently and find the two copies of the traced line
const texts = frames.filter((f) => f.kind === 'zstd').map((f) => {
  const s = readFileSync(tmp).subarray(f.offset, f.offset + f.length);
  return zstdDecompressSync(s).toString('utf8');
});
// parse the JSONL record, then inspect the stored payload text verbatim
const hit = (t) => {
  for (const line of t.split('\n')) {
    if (!line.includes('tool/result')) continue;
    const p = JSON.parse(line).payload.text.split('\n').find((l) => l.includes('r="98"'));
    if (p) return p;
  }
  return '';
};
const g1 = hit(texts[0]), g2 = hit(texts[1]);
const spliceKept = g1.includes('stro0,1 821,730') && g2.includes('stroke-width="6.5"');
const distinct = g1 !== g2;

unlinkSync(tmp);
console.log(JSON.stringify({ frames: frames.length, okFrames, spliceKept, distinct, corruptLen: g1.length, cleanLen: g2.length }, null, 2));
process.exit(okFrames && spliceKept && distinct ? 0 : 1);
