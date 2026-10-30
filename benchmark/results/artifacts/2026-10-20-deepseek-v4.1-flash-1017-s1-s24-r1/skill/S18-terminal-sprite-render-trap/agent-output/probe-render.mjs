
const ESC = String.fromCharCode(27);
const hex = c => c ? '#' + c.map(v => v.toString(16).padStart(2,'0')).join('') : 'transparent';
const C = { K:[18,18,26], B:[70,130,220], P:[230,110,160], W:[240,240,250] };
const pal = { '.': undefined, K:C.K, B:C.B, P:C.P, W:C.W };
const fg = r => ESC+'[38;2;'+r[0]+';'+r[1]+';'+r[2]+'m';
const bg = r => ESC+'[48;2;'+r[0]+';'+r[1]+';'+r[2]+'m';
const RESET = ESC+'[0m', BGDEF = ESC+'[49m', EL = ESC+'[K';

// ---- the shipped algorithm, verbatim in shape ----
function shipped(upper, lowerProbe, width){
  const out = []; let cur = '';
  for (let x = 0; x < upper.length; x++){
    const up = pal[upper[x]], lo = pal[(lowerProbe[x] ?? '.')];
    let seq, ch;
    if (up !== undefined && lo !== undefined){ seq = fg(up)+bg(lo); ch = '\u2580'; }
    else if (up !== undefined){ seq = fg(up); ch = '\u2580'; }
    else if (lo !== undefined){ seq = fg(lo); ch = '\u2584'; }
    else { seq = ''; ch = ' '; }
    if (seq !== cur){ out.push(seq === '' ? RESET : seq); cur = seq; }
    out.push(ch);
  }
  let row = out.join('').replace(/[ ]+$/, '');
  if (!row.endsWith(RESET)) row += RESET;
  return row;
}
function contractFixed(upper, lowerProbe, width){
  const out = []; let cur = '';
  for (let x = 0; x < width; x++){
    const up = pal[(upper[x] ?? '.')], lo = pal[(lowerProbe[x] ?? '.')];
    let seq, ch;
    if (up !== undefined && lo !== undefined){ seq = fg(up)+bg(lo); ch = '\u2580'; }
    else if (up !== undefined){ seq = BGDEF+fg(up); ch = '\u2580'; }
    else if (lo !== undefined){ seq = BGDEF+fg(lo); ch = '\u2584'; }
    else { seq = ''; ch = ' '; }
    if (seq !== cur){ out.push(seq === '' ? RESET : seq); cur = seq; }
    out.push(ch);
  }
  return out.join('') + EL + RESET;
}
// ---- terminal emulator: each cell keeps the two pixel slots it displays ----
function screen(rows, cols){
  return Array.from({length:rows}, () => Array.from({length:cols}, () => ({ g:' ', up:null, lo:null, touched:false })));
}
function paint(line, row, opts){
  const s = opts.stripTrailing ? line.replace(/[ \t]+$/, '') : line;
  let f=null, b=null, i=0, x=0;
  while (i < s.length){
    if (s[i] === ESC){
      const sgr = /^\x1b\[([0-9;]*)m/.exec(s.slice(i, i+24));
      if (sgr){
        const p = sgr[1].split(';').filter(v => v !== '').map(Number);
        const k = p.length ? p[0] : 0;
        if (k === 0){ f = null; b = null; }
        else if (k === 38) f = p.slice(2);
        else if (k === 48) b = p.slice(2);
        else if (k === 39) f = null;
        else if (k === 49) b = null;
        i += sgr[0].length; continue;
      }
      const csi = /^\x1b\[[0-9;]*[A-Za-z]/.exec(s.slice(i, i+8));
      if (!csi) throw new Error('unparsed escape');
      if (csi[0].endsWith('K')) for (let k = x; k < row.length; k++){ row[k] = { g:' ', up:null, lo:null, touched:true }; }
      i += csi[0].length; continue;
    }
    const g = s[i++]; const cell = row[x++];
    if (!cell) break;
    cell.touched = true;
    if (g === '\u2580'){ cell.g = g; cell.up = f; cell.lo = b; }
    else if (g === '\u2584'){ cell.g = g; cell.up = b; cell.lo = f; }
    else { cell.g = ' '; cell.up = null; cell.lo = null; }
  }
}

console.log('== A. phantom halves, shipped vs contract-fixed ==');
console.log('   (cell renders upper pixel = fg, lower pixel = bg for U+2580; "phantom" = a pixel slot');
console.log('    painted although the frame data says transparent)');
const cases = [
  ['outline right edge   ', 'BBBBKKKKKKKK', 'BBBBKKKKKKK.'],
  ['outline lower longer ', 'BBBBKKKKKKK.', 'BBBBKKKKKKKK'],
  ['sleep-Z top stroke   ', 'WWWWW.......', 'WWWWWWWWWWW.'],
  ['heart right lobe     ', 'PPPPPPP.....', 'PPPPPP......'],
  ['body interior (no op)', 'BBBBBBBBBBBB', 'BBBBBBBBBBBB'],
];
let shippedBad = 0, fixedBad = 0;
for (const [name, u, l] of cases){
  const width = u.length;
  const check = (rowStr) => {
    const row = screen(1, width)[0];
    paint(rowStr, row, { stripTrailing:true });
    const bad = [];
    for (let x = 0; x < width; x++){
      const eu = pal[u[x]], el = pal[l[x] ?? '.'];
      const got = row[x];
      const wantUp = eu ?? null, wantLo = el ?? null;
      const same = (a,b2) => (a===null && b2===null) || (a && b2 && a.join()===b2.join());
      if (!same(got.up, wantUp)) bad.push('c'+x+' upper='+hex(got.up)+' want='+hex(wantUp));
      if (!same(got.lo, wantLo)) bad.push('c'+x+' lower='+hex(got.lo)+' want='+hex(wantLo));
    }
    return bad;
  };
  const bs = check(shipped(u,l,width));
  const bf = check(contractFixed(u,l,width));
  shippedBad += bs.length; fixedBad += bf.length;
  console.log('\n  '+name+' upper='+u+' lower='+l);
  console.log('    shipped : '+(bs.length ? bs.join(', ') : 'clean'));
  console.log('    contract: '+(bf.length ? bf.join(', ') : 'clean'));
}
console.log('\n  totals over the 5 probe shapes -> shipped deviations: '+shippedBad+', contract-fixed: '+fixedBad);

console.log('\n== B. ghost frames: WIDE -> NARROW, pipeline strips trailing spaces ==');
const W = 32;
const pad = s => (s + '.'.repeat(W)).slice(0, W);
const WIDE = [pad('BBBBKKKKKKKKKKKKKKKKKKKKKKKKKKKK'), pad('BBBBKKKKKKKKKKKKKKKKKKKKKKKKKKKK'),
              pad('BBBBKKKKKKKKKKKKKKKKKKKKKKKKKKKK'), pad('BBBBKKKKKKKKKKKKKKKKKKKKKKKKKKKK')];
const NARROW = [pad('BBBBKKKKKKKKKKKKKKKKKK'), pad('BBBBKKKKKKKKKKKKKKKKKK'),
                pad('BBBBKKK.............K'), pad('BBBBKK..............K')];
const filled = f => f.reduce((n,l) => n + [...l].filter(c => pal[c]).length, 0);
const paintFrame = (scr, frame, opts) => {
  for (let r = 0; r < frame.length; r += 2){
    const line = frame[r].replace(/\.+$/, '');
    const lower = (frame[r+1] ?? '').replace(/\.+$/, '');
    const row = opts.pad ? contractFixed(pad(frame[r]), pad(frame[r+1] ?? ''), W) : shipped(line, lower, W);
    paint(row, scr[r/2], { stripTrailing: opts.strip });
  }
};
const show = scr => scr.map(row => row.map(c => c.g).join('').replace(/\s+$/,'')).join('\n');
const ghosts = (scr, frame) => {
  let n = 0;
  for (let r = 0; r < frame.length; r += 2)
    for (let x = 0; x < W; x++){
      const eu = pal[frame[r][x]], el = pal[frame[r+1][x]];
      if (scr[r/2][x].up !== null && eu === undefined) n++;
      if (scr[r/2][x].lo !== null && el === undefined) n++;
    }
  return n;
};
let scr = screen(2, W);
paintFrame(scr, WIDE, { strip:true, pad:false });
paintFrame(scr, NARROW, { strip:true, pad:false });
console.log('  screen after WIDE then NARROW (shipped):\n   ' + show(scr).replace(/\n/g,'\n   '));
console.log('  narrow frame carries '+filled(NARROW)+' pixels; screen carries '+ghosts(scr,NARROW)+' ghost pixel slots');
scr = screen(2, W);
paintFrame(scr, WIDE, { strip:true, pad:true });
paintFrame(scr, NARROW, { strip:true, pad:true });
console.log('  same with fixed width + EL: ghost pixel slots = '+ghosts(scr,NARROW));

console.log('\n== C. why the CI job cannot exit ==');
const keep = setTimeout(() => {}, 60000);              // stands in for the TTY/stdin of an interactive app
let n = 0;
function planner(){
  const t = setTimeout(planner, 16);                   // reschedules itself forever
  if (++n <= 2) done();
}
function done(){
  const r = process.getActiveResourcesInfo();
  console.log('  after the scene checks pass, active resources: '+JSON.stringify(r));
  console.log('  Timeout present = a ref\'d timer still holds the event loop -> node never exits.');
  clearTimeout(keep);
  console.log('  after removing the ref\'d handle   : '+JSON.stringify(process.getActiveResourcesInfo()));
}
planner();
// the planner chain would keep this process alive forever; step A/B/C output is already
// flushed, so terminate explicitly (this is the very fix under test, done from outside).
setTimeout(() => process.exit(0), 200);
