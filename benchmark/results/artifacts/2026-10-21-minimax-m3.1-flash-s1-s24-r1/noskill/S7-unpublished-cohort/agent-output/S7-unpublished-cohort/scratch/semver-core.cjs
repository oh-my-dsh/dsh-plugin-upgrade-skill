'use strict';
// Faithful re-implementation of node-semver range rules (semver.org spec tables).
// replaceCaret:  M!==0 -> >=M.m.p[-r] <M+1.0.0-0
//                M==0,m!==0 -> >=M.m.p[-r] <M.m+1.0-0
//                M==0,m==0 -> >=M.m.p[-r] <M.m.p+1-0
// replaceTilde:  M!==0 -> >=M.m.p[-r] <M.m+1.0-0
//                M==0,m!==0 -> >=M.m.p[-r] <M.m+1.0-0
//                M==0,m==0 -> >=M.m.p[-r] <M.m.p+1-0
function parse(v){
  const m=/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/.exec(String(v).trim());
  if(!m) return null;
  return {major:+m[1],minor:+m[2],patch:+m[3],pre:m[4]?m[4].split('.'):[],raw:String(v).trim()};
}
function cmpPre(a,b){
  if(a.length===0&&b.length===0) return 0;
  if(a.length===0) return 1;
  if(b.length===0) return -1;
  const n=Math.max(a.length,b.length);
  for(let i=0;i<n;i++){
    const x=a[i],y=b[i];
    if(x===undefined&&y===undefined) return 0;
    if(x===undefined) return -1;
    if(y===undefined) return 1;
    const xn=/^\d+$/.test(x),yn=/^\d+$/.test(y);
    if(xn&&yn){ if(+x!==+y) return +x<+y?-1:1; }
    else if(xn) return -1;
    else if(yn) return 1;
    else if(x!==y) return x<y?-1:1;
  }
  return 0;
}
function compare(a,b){
  if(a.major!==b.major) return a.major<b.major?-1:1;
  if(a.minor!==b.minor) return a.minor<b.minor?-1:1;
  if(a.patch!==b.patch) return a.patch<b.patch?-1:1;
  return cmpPre(a.pre,b.pre);
}
function caret(v){
  const p=parse(v); if(!p) throw new Error('bad '+v);
  const M=p.major,m=p.minor,pa=p.patch,r=p.pre.length?p.pre.join('.'):null;
  if(M!==0) return `>=${M}.${m}.${pa}${r?'-'+r:''} <${M+1}.0.0-0`;
  if(m!==0) return `>=${M}.${m}.${pa}${r?'-'+r:''} <${M}.${m+1}.0-0`;
  return `>=${M}.${m}.${pa}${r?'-'+r:''} <${M}.${m}.${pa+1}-0`;
}
function tilde(v){
  const p=parse(v); if(!p) throw new Error('bad '+v);
  const M=p.major,m=p.minor,pa=p.patch,r=p.pre.length?p.pre.join('.'):null;
  if(M!==0) return `>=${M}.${m}.${pa}${r?'-'+r:''} <${M}.${m+1}.0-0`;
  if(m!==0) return `>=${M}.${m}.${pa}${r?'-'+r:''} <${M}.${m+1}.0-0`;
  return `>=${M}.${m}.${pa}${r?'-'+r:''} <${M}.${m}.${pa+1}-0`;
}
function parseComparator(tok){
  const m=/^(>=|<=|>|<|=|\^|~)?\s*(.+)$/.exec(tok.trim());
  let op=m[1]||'='; let rest=m[2].trim();
  if(op==='^') return {expand:caret(rest)};
  if(op==='~') return {expand:tilde(rest)};
  if(op==='='&&rest.startsWith('v')) rest=rest.slice(1);
  return {expand:(op==='='?'' : op)+rest};
}
function rangeSets(range){
  return String(range).split('||').map(function(part){
    return part.trim().split(/\s+/).filter(Boolean).map(parseComparator).map(function(c){
      if(c.expand.indexOf(' ')>-1){
        return c.expand.split(/\s+/).map(function(t){
          const op=(t.slice(0,2)==='>='||t.slice(0,2)==='<=')?t.slice(0,2):t[0];
          return {op:op,ver:parse(t.replace(/^>=|^<=|^>|<|^=/,''))};
        });
      }
      const t=c.expand;
      const op=(t.slice(0,2)==='>='||t.slice(0,2)==='<=')?t.slice(0,2):((t[0]==='>'||t[0]==='<')?t[0]:'=');
      return [{op:op,ver:parse(t.replace(/^>=|^<=|^>|<|^=/,''))}];
    }).flat();
  });
}
function testSet(set,ver,includePrerelease){
  for(const c of set){
    if(!c.ver) continue;
    const r=compare(ver,c.ver);
    if(c.op==='>='&&!(r>=0)) return false;
    if(c.op==='>'&&!(r>0)) return false;
    if(c.op==='<='&&!(r<=0)) return false;
    if(c.op==='<'&&!(r<0)) return false;
    if(c.op==='='&&!(r===0)) return false;
  }
  if(ver.pre.length&&!includePrerelease){
    for(const c of set){
      if(c.ver&&c.ver.pre.length>0&&c.ver.major===ver.major&&c.ver.minor===ver.minor&&c.ver.patch===ver.patch) return true;
    }
    return false;
  }
  return true;
}
function rangeTest(range,ver,includePrerelease){
  const sets=rangeSets(range);
  for(const s of sets){ if(testSet(s,ver,includePrerelease)) return true; }
  return false;
}
function maxSatisfying(versions,range){
  let best=null;
  for(const v of versions){ const p=parse(v); if(rangeTest(range,p,false)&&(best===null||compare(p,parse(best))>0)) best=v; }
  return best;
}
module.exports={parse,compare,caret,tilde,rangeSets,rangeTest,maxSatisfying,parseComparator};