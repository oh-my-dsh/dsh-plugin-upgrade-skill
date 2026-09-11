import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import test from 'node:test'

const taskRoot = fileURLToPath(new URL('../tasks/', import.meta.url))
const helpers = readdirSync(taskRoot).flatMap(task => {
  try {
    const source = readFileSync(join(taskRoot, task, 'tests/judge-utils.mjs'), 'utf8')
    return source.includes('export async function createProfile(') ? [{ task, source }] : []
  } catch { return [] }
})
assert.equal(helpers.length, 47, 'cover all profile-creating helper copies')

for (const { task, source } of helpers) test(`${task}: profile setup errors throw, successful setup remains valid`, async () => {
  const root = mkdtempSync(join(tmpdir(), 'profile-creation-'))
  try {
    writeFileSync(join(root, 'judge-result.mjs'), readFileSync(new URL('./verifier/judge-result.mjs', import.meta.url)))
    const profiles = join(root, 'dsh')
    // Exercise the real localExec shell. Only relocate the absolute profile root:
    // a regular file blocks mkdir, without touching the machine's /root/.dsh.
    writeFileSync(profiles, 'blocks creation')
    const relocated = source.replaceAll('/root/.dsh', profiles)
    writeFileSync(join(root, 'helper.mjs'), relocated)
    const { createProfile } = await import(pathToFileURL(join(root, 'helper.mjs')))
    await assert.rejects(createProfile('blocked', []), /profile creation failed/)
    rmSync(profiles)
    const created = await createProfile('healthy', ['example-host'])
    assert.equal(created.ok, true)
    assert.deepEqual(JSON.parse(readFileSync(join(profiles, 'profiles/healthy/package.json'), 'utf8')).dsh.profile.bundles, ['example-host'])
    assert.equal(readFileSync(join(profiles, 'profiles/healthy/cordis.yml'), 'utf8'), '[]\n')
    // Redirect a seed output to a directory to exercise actual shell redirection
    // failure after package creation has succeeded (no mocked localExec).
    const blockedSeed = join(root, 'seed-is-directory')
    mkdirSync(blockedSeed)
    for (const filename of ['pnpm-workspace.yaml', 'cordis.patch.yml', 'cordis.yml']) {
      const shellTarget = '${dir}/' + filename
      const seedSource = relocated.includes(shellTarget)
        ? relocated.replaceAll(shellTarget, blockedSeed)
        : relocated.replace(`join(dir, '${filename}')`, JSON.stringify(blockedSeed))
      assert.notEqual(seedSource, relocated)
      const helperPath = join(root, `seed-${filename}.mjs`)
      writeFileSync(helperPath, seedSource)
      const seedHelper = await import(pathToFileURL(helperPath))
      await assert.rejects(seedHelper.createProfile('seed-failure', []), /profile creation failed/)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
