// Builds the Journal of Systems and Software (Elsevier) submission source from
// paper/latex/acl_latex.tex: elsarticle front matter, Elsevier author and
// affiliation markup, keywords, harvard references, and the declarations in
// paper/submission/jss-declarations.tex. Writes output/jss/src/ (flat, with
// generated inputs and the bibliography). Offline; compile with
//   tectonic --keep-intermediates --outdir output/jss/src output/jss/src/main.tex
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('../..', import.meta.url))
const out = join(root, 'output/jss/src')
const read = (p) => fs.readFileSync(join(root, p), 'utf8')
let s = read('paper/latex/acl_latex.tex')
const once = (from, to) => { assert.equal(s.split(from).length, 2, `expected once: ${from.slice(0, 60)}`); s = s.replace(from, to) }

// Authors and affiliations from the authblk block.
const affils = Object.fromEntries([...s.matchAll(/^\\affil\[(\d+)\]\{(.*)\}$/gm)].map((m) => [m[1], m[2]]))
// Corresponding and equal-contribution notes are read from each author's
// \thanks / \footnotemark so the authblk source stays the single truth.
const authors = [...s.matchAll(/^\\author\[([\d,]+)\]\{([^\\}]+)(.*)\}$/gm)].map((m) => ({
  marks: m[1].split(','), name: m[2],
  email: (m[3].match(/Corresponding author: \\texttt\{([^}]+)\}/) || [])[1],
  equal: /Equal contribution|\\footnotemark/.test(m[3]),
}))
assert.equal(authors.filter((a) => a.email).length, 1, 'exactly one corresponding author')
const country = (org) => /Independent Researcher/.test(org) ? null : /Frederick Gunn/.test(org) ? 'United States' : 'China'
const letter = (n) => String.fromCharCode(96 + Number(n))
const front = [
  '\\begin{frontmatter}',
  '\\title{Evaluating Agent Skills for Version-Specific Plugin Migration: A Retrospective Study}',
  ...authors.map((a) => {
    const notes = (a.email ? '\\corref{cor1}' : '') + (a.equal ? '\\fnref{eq}' : '')
    return `\\author[${a.marks.map(letter).join(',')}]{${a.name}${notes}}` + (a.email ? `\n\\ead{${a.email}}` : '')
  }),
  '\\cortext[cor1]{Corresponding author.}',
  '\\fntext[eq]{These authors contributed equally to this work.}',
  ...Object.entries(affils).map(([n, org]) => {
    const c = country(org)
    // Plain-text form avoids elsarticle's trailing comma when no country is known.
    return c ? `\\affiliation[${letter(n)}]{organization={${org}}, country={${c}}}` : `\\affiliation[${letter(n)}]{${org}}`
  }),
].join('\n')

// Preamble: elsarticle loads natbib itself; drop article-only packages.
once('\\documentclass[11pt]{article}', '\\documentclass[preprint,12pt,authoryear]{elsarticle}')
once('\\usepackage[round,authoryear]{natbib}\n', '')
s = s.replace(/\\usepackage\{authblk\}\n(\\renewcommand\\(Authfont|Affilfont|Authands)[^\n]*\n|\\setlength\{\\affilsep\}[^\n]*\n)*/, '')
s = s.replace(/^\\title\{[^\n]*\n/m, '')
s = s.replace(/^%[^\n]*\n(?=%|\\author)/gm, '')
s = s.replace(/^\\author\[[^\n]*\n/gm, '').replace(/^\\affil\[[^\n]*\n/gm, '')
once('\\date{}\n', '')

// Front matter: title, authors, abstract, keywords.
const abstract = s.match(/\\begin\{abstract\}[\s\S]*?\\end\{abstract\}/)[0]
const kw = s.match(/\\noindent\\textbf\{Keywords:\}\s*([^\n]*)\n/)
assert.ok(kw)
s = s.replace(abstract + '\n', '').replace(kw[0], '')
once('\\begin{document}\n\\maketitle\n',
  `\\begin{document}\n${front}\n${abstract}\n\\begin{keyword}\n${kw[1].split(';').map((k) => k.trim()).join(' \\sep ')}\n\\end{keyword}\n\\end{frontmatter}\n`)

// Journal declarations replace the arXiv AI-assistance note.
const aiNote = s.match(/\\section\*\{Use of AI Assistance\}\n[^\n]*\n/)[0]
once(aiNote, read('paper/submission/jss-declarations.tex').replace(/^%[^\n]*\n/gm, '').trim() + '\n')
once('\\bibliographystyle{plainnat}', '\\bibliographystyle{elsarticle-harv}')
s = s.replaceAll('\\input{../generated/', '\\input{generated/')

fs.rmSync(out, { recursive: true, force: true })
fs.mkdirSync(join(out, 'generated'), { recursive: true })
fs.writeFileSync(join(out, 'main.tex'), s)
for (const f of new Set([...s.matchAll(/\\input\{generated\/([^}]+)\}/g)].map((m) => m[1]))) {
  fs.copyFileSync(join(root, 'paper/generated', f), join(out, 'generated', f))
}
fs.copyFileSync(join(root, 'paper/latex/custom.bib'), join(out, 'custom.bib'))
console.log(JSON.stringify({ out: 'output/jss/src', authors: authors.length, affiliations: Object.keys(affils).length }))
