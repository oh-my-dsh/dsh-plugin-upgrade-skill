
import { spawn } from 'node:child_process';

const ESC = String.fromCharCode(27);
const hex = r => r[0].toString(16).padStart(2,'0')+r[1].toString(16).padStart(2,'0')+r[2].toString(16).padStart(2,'0');
const C = {K:[18,18,26], B:[70,130,220], P:[230,110,160], W:[240,240,250]};
const pal = { '.': undefined, K:C.K, B:C.B, P:C.P, W:C.W };
const fg = r => ESC+'[38;2;'+r[0]+';'+r[1]+';'+r[2]+'m';
const bg = r => ESC+'[48;2;'+r[0]+';'+r[1]+';'+r[2]+'m';
const RESET = ESC+'[0m', BGDEF = ESC+'[49m';

function renderShipped(upper, lower){
  let out='', cur='';
  for (let x=0; x<upper.length; x++){
    const up=pal[upper[x]], lo=pal[lower[x]];
    let seq, ch;
    if (up!==undefined && lo!==undefined){ seq=fg(up)+bg(lo); ch='\u2580'; }
    else if (up!==undefined){ seq=fg(up); ch='\u2580'; }
    else if (lo!==undefined){ seq=fg(lo); ch='\u2584'; }
    else { seq=''; ch=' '; }
    if (seq!==cur){ out += (seq===''?RESET:seq); cur=seq; }
    out += ch;
  }
  let row = out.replace(/[ ]+$/,'');
  if (!row.endsWith(RESET)) row += RESET;
  return row;
}
function renderFixed(upper, lower){
  let out='', cur='';
  for (let x=0; x<upper.length; x++){
    const up=pal[upper[x]], lo=pal[lower[x]];
    let seq, ch;
    if (up!==undefined && lo!==undefined){ seq=fg(up)+bg(lo); ch='\u2580'; }
    else if (up!==undefined){ seq=BGDEF+fg(up); ch='\u2580'; }
    else if (lo!==undefined){ seq=BGDEF+fg(lo); ch='\u2584'; }
    else { seq=''; ch=' '; }
    if (seq!==cur){ out += (seq===''?RESET:seq); cur=seq; }
    out += ch;
  }
  return out;   // no trimming: caller pads to width and appends EL
}
function halves(upper, lower, row){
  const cells=[]; let f=null,b=null,i=0,x=0; const re=/^\x1b\[([0-9;]*)m/;
  while (i<row.length){
    if (row[i]===ESC){ const m=re.exec(row.slice(i)); const p=m[1].split(';').map(Number);
      if(p[0]===0){f=null;b=null;} else if(p[0]===38){f=p.slice(2);} else if(p[0]===48){b=p.slice(2);}
      else if(p[0]===39){f=null;} else if(p[0]===49){b=null;}
      i+=m[0].length; continue; }
    const g=row[i]; i++;
    const up=pal[upper[x]], lo=pal[lower[x]];
    const upC = g==='\u2580'?f:b, loC = g==='\u2580'?b : g==='\u2584'?f : b;
    cells.push({x, up:!!up, lo:!!lo, upC, loC, g});
    x++;
  }
  return cells;
}
const phantom = (u,l,row) => halves(u,l,row).filter(c => (!c.up && c.upC) || (!c.lo && c.loC))
  .map(c => 'cell'+c.x+(c.up ? ' lower-half '+hex(c.loC) : ' upper-half '+hex(c.upC)));

console.log('== A. phantom halves in the shipped renderer ==');
const A = [['outline right edge','BBBBKK','BBBBK.'],
           ['heart right lobe  ','PPPPPP','PPPPP.'],
           ['sleep-Z stroke    ','WWWWW.','WWWWWW'],
           ['control (1-cell gap)','BBBBK.K','BBBBK..']];
for (const [n,u,l] of A){
  console.log('  '+n+'  upper="'+u+'" lower="'+l+'"');
  console.log('    shipped -> '+(phantom(u,l,renderShipped(u,l)).join(', ')||'none'));
  console.log('    fixed   -> '+(phantom(u,l,renderFixed(u,l)).join(', ')||'none'));
}

console.log('\n== B. row width is data-dependent (wide -> narrow frame) ==');
const wideU='BBBBBBBBKKKKKKKKKK......', wideL='BBBBBBBBKKKKKKKKKK......';
const narU ='BBBBKKKK....',            narL ='BBBBKKKK....';
const glyphs = s => [...s.replace(/\x1b\[[0-9;]*m/g,'')].length;
console.log('  wide  row glyph width = '+glyphs(renderShipped(wideU,wideL)));
console.log('  narrow row glyph width = '+glyphs(renderShipped(narU,narL)));
console.log('  surplus columns left painted by the wide frame = '+(glyphs(renderShipped(wideU,wideL))-glyphs(renderShipped(narU,narL))));

console.log('\n== C. event loop pinned by a re-arming timer ==');
const child = (body) => new Promise(res => {
  const p = spawn(process.execPath, ['-e', body], { stdio: 'ignore' });
  let exited = false; const t0 = Date.now();
  p.on('exit', () => { exited = true; res({ exited: true, ms: Date.now()-t0 }); });
  setTimeout(() => { if (!exited) { p.kill('SIGKILL'); res({ exited: false, ms: Date.now()-t0 }); } }, 1500);
});
const rearm = "let n=0; const tick=()=>{ if(++n<1e9) setTimeout(tick,10); }; setTimeout(tick,10);";
const refd = await child(rearm);
console.log('  ref\'d re-arming timer (shipped planner) : exited='+refd.exited+' after '+refd.ms+'ms (watchdog 1500ms)');
const unrefd = await child("let n=0; const tick=()=>{ if(++n<1e9) setTimeout(tick,10).unref(); }; setTimeout(tick,10).unref();");
console.log('  unref\'d re-arming timer (one-line fix)  : exited='+unrefd.exited+' after '+unrefd.ms+'ms');
