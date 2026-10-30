#!/usr/bin/env node
// Reproduces the shipped renderSpriteRows loop (fixture/renderer-excerpt.ts) verbatim and
// walks its output with an ANSI state machine to show
//   A) the inherited background of a half-filled cell (phantom pixels),
//   B) the variable row width / trailing-whitespace trap (ghost frames),
//   C) the self-re-arming timer that pins the event loop (CI hang).
// Read-only w.r.t. the fixture; writes nothing.

const fg = (rgb) => `\x1b[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m`;
const bg = (rgb) => `\x1b[48;2;${rgb[0]};${rgb[1]};${rgb[2]}m`;
const RESET = '\x1b[0m';
const EL = '\x1b[K';

const palette = { '.': undefined, D: [26,28,38], B: [40,120,190], H: [220,50,70] };

// --- verbatim port of the shipped loop (only the frame data is synthetic) ---
function renderSpriteRows(sprite, palette) {
  const rows = [];
  for (let r = 0; r < sprite.length; r += 2) {
    const upper = sprite[r];
    const lower = sprite[r + 1] ?? '';
    let out = '';
    let current = '';
    for (let x = 0; x < upper.length; x++) {
      const up = palette[upper[x]];
      const lo = palette[lower[x]];
      let seq; let ch;
      if (up !== undefined && lo !== undefined) { seq = fg(up) + bg(lo); ch = '\u2580'; }
      else if (up !== undefined) { seq = fg(up); ch = '\u2580'; }
      else if (lo !== undefined) { seq = fg(lo); ch = '\u2584'; }
      else { seq = ''; ch = ' '; }
      if (seq !== current) { out += seq === '' ? RESET : seq; current = seq; }
      out += ch;
    }
    let row = out.replace(/[ ]+$/, '');
    if (!row.endsWith(RESET)) row += RESET;
    rows.push(row);
  }
  return rows;
}

// --- ANSI state walker: what the terminal would actually show, per cell ---
function walk(row) {
  const cells = [];
  let curFg = 'default'; let curBg = 'default'; let i = 0;
  while (i < row.length) {
    if (row[i] === '\x1b' && row[i + 1] === '[') {
      const m = /^\x1b\[([0-9;]*)m/.exec(row.slice(i));
      if (m) {
        const p = m[1].split(';').map(Number);
        if (m[1] === '' || m[1] === '0') { curFg = 'default'; curBg = 'default'; }
        else if (p[0] === 38 && p[1] === 2) curFg = 'rgb(' + p[2] + ',' + p[3] + ',' + p[4] + ')';
        else if (p[0] === 48 && p[1] === 2) curBg = 'rgb(' + p[2] + ',' + p[3] + ',' + p[4] + ')';
        i += m[0].length; continue;
      }
    }
    cells.push({ ch: row[i], fg: curFg, bg: curBg });
    i++;
  }
  return cells;
}
const plain = (s) => s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');            // visible glyph cells
const stripSgr = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');                // keeps ESC[K

console.log('='.repeat(80));
console.log('A. PHANTOM PIXEL: inherited background in the empty half of a half-filled cell');
console.log('='.repeat(80));
// whale-like right edge: dark outline over body, then a heart, then transparent columns
const upper = '....DDDDDDDDDHH.....';
const lower = '...DBBBBBBBB........';
const rowA = renderSpriteRows([upper, lower], palette)[0];
console.log('raw row :', JSON.stringify(rowA));
console.log('');
console.log('cell  up lo  glyph  fg-at-write         bg-at-write         verdict');
const cellsA = walk(rowA);
for (let x = 0; x < cellsA.length; x++) {
  const c = cellsA[x];
  const up = palette[upper[x]]; const lo = palette[lower[x]];
  let verdict = '';
  if ((up === undefined) !== (lo === undefined)) verdict = 'half-cell';
  if (c.bg !== 'default' && (up === undefined || lo === undefined))
    verdict += '  <== PHANTOM: empty half painted ' + c.bg;
  console.log(
    String(x).padStart(4), '  ', upper[x], ' ', lower[x], '   ', c.ch === ' ' ? '(sp)' : c.ch,
    '   ', c.fg.padEnd(18), ' ', c.bg.padEnd(18), ' ', verdict);
}
console.log('');
console.log('visible cells emitted:', cellsA.length, '| sprite width:', upper.length,
            '-> every trailing transparent cell was deleted, not blanked');

console.log('');
console.log('='.repeat(80));
console.log('B. GHOST FRAME: row width is data-dependent; trailing blanks are not paint');
console.log('='.repeat(80));
const W = 40;
const wide   = renderSpriteRows(['B'.repeat(W),  'B'.repeat(W)], palette)[0];
const narrow = renderSpriteRows(['B'.repeat(28) + '.'.repeat(12), 'B'.repeat(28)], palette)[0];
console.log('wide pose   visible cells:', plain(wide).length);
console.log('narrow pose visible cells:', plain(narrow).length,
            '-> columns 28..39 are never written, so the wide tail survives');
const pipelineTrim = (s) => stripSgr(s).replace(/\s+$/, '');            // what the text pipeline does
const padded = narrow.replace(/\x1b\[0m$/, '') + ' '.repeat(12) + RESET; // naive "pad to width" fix
console.log('naive pad with 12 spaces -> visible cells after pipeline trim:', pipelineTrim(padded).length,
            '(padding is stripped, still 28)');
const withEL = narrow.replace(/\x1b\[0m$/, '') + EL + RESET;
console.log('narrow + ESC[K           -> ESC[K survives pipeline trim:', pipelineTrim(withEL).includes(EL),
            '(ESC[K is not whitespace)');
console.log('recommended row suffix   :', JSON.stringify(RESET + EL), '(pad to canvas width first, then EL)');

console.log('');
console.log('='.repeat(80));
console.log('C. HANG: a self-re-arming setTimeout is a ref-ed handle that pins the event loop');
console.log('='.repeat(80));
function planner(ms, { unref }) {
  let n = 0;
  const tick = () => {
    if (++n >= 10000) return;                 // the animation is a loop: effectively unbounded
    const next = setTimeout(tick, ms);
    if (unref && typeof next.unref === 'function') next.unref();
  };
  const first = setTimeout(tick, ms);
  if (unref && typeof first.unref === 'function') first.unref();
  return () => clearTimeout(first);
}
console.log('mounted, flag OFF        -> ref-ed Timeouts:', process.getActiveResourcesInfo().filter(r => r === 'Timeout').length);
const stop = planner(16, { unref: false });
console.log('mounted, flag ON (as is)-> ref-ed Timeouts:', process.getActiveResourcesInfo().filter(r => r === 'Timeout').length,
            '=> loop pinned, job cannot exit');
stop();
console.log('unmount() clears         -> ref-ed Timeouts:', process.getActiveResourcesInfo().filter(r => r === 'Timeout').length);
planner(16, { unref: true });
console.log('mounted, flag ON + unref -> ref-ed Timeouts:', process.getActiveResourcesInfo().filter(r => r === 'Timeout').length,
            '=> animation still ticks, loop drains, process exits');
console.log('hosts that never unmount never run the clear; unref() makes that harmless.');
