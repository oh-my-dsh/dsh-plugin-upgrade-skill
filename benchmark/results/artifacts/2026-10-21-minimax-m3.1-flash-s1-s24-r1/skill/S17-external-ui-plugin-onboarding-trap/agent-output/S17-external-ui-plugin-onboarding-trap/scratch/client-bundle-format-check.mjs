#!/usr/bin/env node
// client-bundle-format-check.mjs — READ-ONLY static gate for DSH Web Client bundles.
//
// WHY: the host composes every installed plugin's client bundle into ONE classic
// <script> ("client bundle combo"). A classic script has no module semantics, so a
// top-level 'import'/'export' is a COMPILE error of the whole script text: the script
// never executes, no __ModuleLoader__.load call runs, and ZERO plugins register.
// A conforming bundle instead ships:
//
//   window.__ModuleLoader__.load({ id, factory: (require) => { ...; return module.exports } })
//
// CHECKS (per candidate client bundle):
//   1. classic-script compile  (new vm.Script(src))   -> the exact host-side failure
//   2. top-level ESM tokens                            -> the same defect, with line numbers
//   3. window.__ModuleLoader__.load({ id, factory })    -> the required packaging shell
//   4. registration id == package.json "name"          -> DSH-0.1.2-A1-26
//
// Usage: node client-bundle-format-check.mjs <dir-or-file> [...]
// Exit: 0 = clean, 1 = at least one offending bundle, 2 = bad usage.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error('usage: node client-bundle-format-check.mjs <dir-or-file> [...]');
  process.exit(2);
}

function walk(p, out = []) {
  const st = fs.statSync(p);
  if (st.isDirectory()) {
    for (const e of fs.readdirSync(p)) {
      if (e === 'node_modules' || e === '.git') continue;
      walk(path.join(p, e), out);
    }
  } else out.push(p);
  return out;
}

// Blank out strings/comments so ESM detection only sees real code positions.
function codeMask(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  let mode = 'code';
  let quote = '';
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (mode === 'code') {
      if (c === '/' && d === '/') { mode = 'line'; out += '  '; i += 2; continue; }
      if (c === '/' && d === '*') { mode = 'block'; out += '  '; i += 2; continue; }
      if (c === '"' || c === "'" || c === '`') { mode = 'str'; quote = c; out += ' '; i++; continue; }
      out += c; i++; continue;
    }
    if (mode === 'line') { if (c === '\n') { mode = 'code'; out += '\n'; } else out += ' '; i++; continue; }
    if (mode === 'block') { if (c === '*' && d === '/') { mode = 'code'; out += '  '; i += 2; continue; } out += c === '\n' ? '\n' : ' '; i++; continue; }
    if (mode === 'str') {
      if (c === '\\') { out += '  '; i += 2; continue; }
      if (c === quote) { mode = 'code'; out += ' '; i++; continue; }
      out += c === '\n' ? '\n' : ' '; i++; continue;
    }
  }
  return out;
}

const lineOf = (src, idx) => src.slice(0, idx).split('\n').length;

let problems = 0;
for (const t of targets) {
  const files = walk(t).filter(f => /\.(js|mjs|cjs|jsx|ts|tsx)$/.test(f) && !/\.d\.ts$/.test(f));
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    const mask = codeMask(src);
    const esm = [];
    const re = /(^|[;{}()\[\]\n])\s*\b(import|export)\b/g;
    let m;
    while ((m = re.exec(mask)) !== null) {
      const at = m.index + m[0].indexOf(m[2]);
      esm.push({ tok: m[2], line: lineOf(src, at) });
    }
    const hasLoader = /window\.__ModuleLoader__\.load\s*\(/.test(src);
    const idMatch = src.match(/id\s*:\s*["'`]([^"'`]+)["'`]/);
    let pkgName = null;
    try { pkgName = JSON.parse(fs.readFileSync(path.join(path.dirname(f), '..', 'package.json'), 'utf8')).name ?? null; } catch {}
    const idOk = !idMatch || !pkgName || idMatch[1] === pkgName;

    let compile = 'OK';
    try { new vm.Script(src, { filename: f }); }
    catch (e) { compile = e.name + ': ' + e.message; }

    const bad = esm.length > 0 || !hasLoader || !idOk || compile !== 'OK';
    if (bad) {
      problems++;
      console.log('OFFENDER ' + f);
      if (compile !== 'OK') console.log('  classic-script compile: ' + compile + '  -> kills the WHOLE combo, zero plugins register');
      if (esm.length) console.log('  top-level ESM token(s): ' + esm.map(e => e.tok + ' @line ' + e.line).join(', '));
      if (!hasLoader) console.log('  missing window.__ModuleLoader__.load({ id, factory }) wrapper');
      if (!idOk) console.log('  registration id "' + (idMatch && idMatch[1]) + '" != package.json name "' + pkgName + '"');
    } else {
      console.log('ok      ' + f + '  (classic script, loader wrapper, id "' + (idMatch && idMatch[1]) + '")');
    }
  }
}
console.log(problems === 0 ? 'RESULT: no offending bundle found' : 'RESULT: ' + problems + ' offending bundle(s)');
process.exit(problems === 0 ? 0 : 1);
