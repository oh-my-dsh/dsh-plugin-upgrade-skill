import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isExcludedMaterialLink } from './material-links.mjs'
const hash = value => createHash('sha256').update(value).digest('hex')
async function fixture(t, target = '../scripts/tool.mjs') {
  const root = await mkdtemp(join(tmpdir(), 'material-links-'))
  t.after(() => rm(root, {recursive:true, force:true}))
  const base = join(root, 'benchmark/conditions/main-56')
  const archive = join(base, 'audit-only/source/plugin-upgrade')
  const content = `[historical link](${target})\n`
  const sourceFiles = [
    {archive_path:'audit-only/source/plugin-upgrade/references/doc.md', sha256:hash(content), runtime_exposure:'C,D'},
    {archive_path:'audit-only/source/plugin-upgrade/scripts/tool.mjs', sha256:hash('original script'), runtime_exposure:'excluded-all-arms'},
  ]
  const material = {conditions:['C','D'].map(condition => ({condition, files:[{path:'references/doc.md',sha256:hash(content)}]}))}
  for (const dir of ['C/references','D/references','audit-only/source/plugin-upgrade/references','audit-only/source/plugin-upgrade/scripts']) await mkdir(join(base,dir),{recursive:true})
  for (const group of ['C','D']) await writeFile(join(base,group,'references/doc.md'),content)
  await writeFile(join(archive,'references/doc.md'),content)
  await writeFile(join(archive,'scripts/tool.mjs'),'original script')
  await writeFile(join(base,'material-manifest.json'),JSON.stringify(material))
  await writeFile(join(base,'source-manifest.json'),JSON.stringify({files:sourceFiles}))
  return {root,base,archive,content,sourceFiles, material, target, file:join(base,'C/references/doc.md')}
}
test('allows archived excluded links in byte-identical manifested C and D references', async t => {
  const f=await fixture(t)
  assert.equal(await isExcludedMaterialLink(f),true)
  assert.equal(await isExcludedMaterialLink({...f,file:join(f.base,'D/references/doc.md')}),true)
})
test('rejects arbitrary broken links and non-condition documents', async t => {
  const f=await fixture(t)
  assert.equal(await isExcludedMaterialLink({...f,target:'../scripts/missing.mjs'}),false)
  assert.equal(await isExcludedMaterialLink({...f,target:'missing.md'}),false)
  assert.equal(await isExcludedMaterialLink({...f,file:join(f.base,'B/references/doc.md')}),false)
  assert.equal(await isExcludedMaterialLink({...f,file:join(f.root,'skills/plugin-upgrade/references/doc.md')}),false)
})
test('rejects runtime or archive content drift even if both copies drift together', async t => {
  const f=await fixture(t)
  await writeFile(f.file,f.content+'changed')
  assert.equal(await isExcludedMaterialLink(f),false)
  await writeFile(join(f.archive,'references/doc.md'),f.content+'changed')
  assert.equal(await isExcludedMaterialLink(f),false)
})
test('rejects missing archive target and manifest exclusion drift', async t => {
  const f=await fixture(t)
  f.sourceFiles[1].runtime_exposure='C,D'
  await writeFile(join(f.base,'source-manifest.json'),JSON.stringify({files:f.sourceFiles}))
  assert.equal(await isExcludedMaterialLink(f),false)
  f.sourceFiles[1].runtime_exposure='excluded-all-arms'
  await writeFile(join(f.base,'source-manifest.json'),JSON.stringify({files:f.sourceFiles}))
  await rm(join(f.archive,'scripts/tool.mjs'))
  assert.equal(await isExcludedMaterialLink(f),false)
})
test('rejects lexical traversal and archive target symlink escape', async t => {
  const f=await fixture(t)
  for (const target of ['../../audit-only/source/plugin-upgrade/scripts/tool.mjs','../scripts/../references/doc.md','/tmp/tool.mjs','../scripts/../../outside.mjs']) {
    assert.equal(await isExcludedMaterialLink({...f,target}),false,target)
  }
  const outside=join(f.root,'outside.mjs')
  await writeFile(outside,'original script')
  await rm(join(f.archive,'scripts/tool.mjs'))
  await symlink(outside,join(f.archive,'scripts/tool.mjs'))
  assert.equal(await isExcludedMaterialLink(f),false)
})
test('allows directory links only when the archived directory has excluded manifest descendants', async t => {
  const f=await fixture(t,'../scripts/')
  assert.equal(await isExcludedMaterialLink(f),true)
  await writeFile(join(f.base,'source-manifest.json'),JSON.stringify({files:[f.sourceFiles[0]]}))
  assert.equal(await isExcludedMaterialLink(f),false)
})
test('rejects archive target content drift and unreadable provenance', async t => {
  const f=await fixture(t)
  await writeFile(join(f.archive,'scripts/tool.mjs'),'modified implementation')
  assert.equal(await isExcludedMaterialLink(f),false)
  await writeFile(join(f.archive,'scripts/tool.mjs'),'original script')
  await writeFile(join(f.base,'source-manifest.json'),'not JSON')
  assert.equal(await isExcludedMaterialLink(f),false)
  await rm(join(f.base,'source-manifest.json'))
  assert.equal(await isExcludedMaterialLink(f),false)
})
