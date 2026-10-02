// verify-runtime.check.mjs — offline self-check for verify-runtime.mjs.
// Runs the diagnosis signatures against representative log fixtures and the
// spec/structure helpers against temp directories; exercises the CLI surface
// including argument validation. No dsh environment required:
// `node scripts/verify-runtime.check.mjs` (also wired into `npm test`).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { classifySpec, detectPluginStructure, diagnoseBootLog, findPackageFromExecutable, hasNonTransportError, isWebPlugin, listKeyFor } from './verify-runtime.mjs'

const here = dirname(fileURLToPath(import.meta.url))

export function runVerifyRuntimeChecks() {
  // --- diagnoseBootLog: signature priority + fixtures ------------------------

  const BOOT_FIXTURES = [
    {
      name: 'activation failure (pending on a removed service — the #5120 migration signal)',
      log: 'Error: dsh: plugin tree failed to load: dsh: 1 entry did not activate\n@demo/p: pending (waiting for service: apiProxy)',
      verdict: 'activation-failed',
      attribution: 'plugin-code',
    },
    {
      name: 'activation assertion outranks a plain service wait (order regression guard)',
      log: '[warn] entry @demo/p waiting for service: database\nError: dsh: 1 entry did not activate',
      verdict: 'activation-failed',
      attribution: 'plugin-code',
    },
    {
      name: 'plain service wait WITHOUT the activation assertion is inconclusive, never a pass',
      log: '[warn] entry @demo/p pending (waiting for service: database)',
      verdict: 'service-wait-unresolved',
      attribution: null,
    },
    {
      name: 'host wait for webServer, plural service list (fleet regression shape)',
      log: '[warn] entry @demo/p waiting for services: webServer, sessionTitle',
      verdict: 'env-needs-service-host',
      attribution: 'profile-config',
    },
    {
      name: 'malformed plugin overlay (loader patch parse failure) is plugin-code',
      log: 'Error: dsh: overlay /x/node_modules/@demo/p/cordis.patch.yml must be a top-level YAML array of loader patch entries',
      verdict: 'activation-failed',
      attribution: 'plugin-code',
    },
    {
      name: 'module resolve crash',
      log: "node:internal/process/esm_loader:404\nError [ERR_MODULE_NOT_FOUND]: Cannot find module '@demo/missing'",
      verdict: 'load-crash-module-resolve',
      attribution: 'dependency-resolution',
    },
    {
      name: 'transport signature = tree loaded (pass)',
      log: '[agent] TRANSPORT: connect ECONNREFUSED 127.0.0.1:9 — model endpoint unreachable',
      verdict: 'pass-boot-probe',
      attribution: null,
    },
    {
      name: 'transport error line itself carries Error: and still passes (no veto)',
      log: 'Error: fetch failed\n    at node:internal/deps/undici/...',
      verdict: 'pass-boot-probe',
      attribution: null,
    },
    {
      name: 'a NON-transport Error line vetoes the transport signature (forged-pass guard)',
      log: 'TRANSPORT ECONNREFUSED 127.0.0.1:9\nError: plugin internal invariant broken',
      verdict: 'ambiguous-error-signature',
      attribution: null,
    },
    {
      name: 'Error SUBCLASSES also veto (TypeError forge — cross-model caught)',
      log: 'TRANSPORT ECONNREFUSED 127.0.0.1:9\nTypeError: plugin activation exploded',
      verdict: 'ambiguous-error-signature',
      attribution: null,
    },
    {
      name: 'bare ERROR marker also vetoes (uppercase form)',
      log: 'fetch failed somewhere\nERROR plugin crashed during init',
      verdict: 'ambiguous-error-signature',
      attribution: null,
    },
  ]

  for (const fx of BOOT_FIXTURES) {
    const got = diagnoseBootLog(fx.log)
    assert.deepEqual(got, { verdict: fx.verdict, attribution: fx.attribution }, `fixture: ${fx.name}`)
  }

  // Priority: a host wait must outrank a transport line appearing later in the log.
  assert.equal(
    diagnoseBootLog('later: TRANSPORT ECONNREFUSED\nfirst: waiting for services: webServer')?.verdict,
    'env-needs-service-host',
    'host wait outranks transport signature',
  )
  // Priority: module crash outranks activation text in the same log.
  assert.equal(
    diagnoseBootLog('x: 1 entry did not activate\ny: Error: Cannot find module')?.verdict,
    'load-crash-module-resolve',
    'module crash outranks activation failure',
  )
  // A plugin waiting for a REMOVED service (apiProxy, the #5120 signature) is an
  // activation failure that migration must fix — only webServer means "wrong env".
  assert.equal(
    diagnoseBootLog('Error: plugin tree failed to load\n@demo/old: pending (waiting for service: apiProxy)')?.verdict,
    'activation-failed',
    'removed-service wait is not an environment issue',
  )

  // The bare word "network" must NOT count as a transport signature.
  assert.equal(
    diagnoseBootLog('[plugin] network features initialised — no error'),
    null,
    'bare "network" is not a pass signature',
  )
  // No signature at all -> null (caller falls back to timeout / exit code).
  assert.equal(diagnoseBootLog('dsh booted fine, quiet log'), null, 'quiet log -> no diagnosis')

  // Timeout-alive veto cross (user decision after three independent reviews):
  // a fully silent hang stays a timeout-pass candidate; error noise disqualifies.
  assert.equal(hasNonTransportError('[mig] routes: 0'), false, 'silent log has no non-transport error')
  assert.equal(hasNonTransportError('[mig] routes: 0\nTypeError: boom'), true, 'subclass error disqualifies timeout-pass')
  assert.equal(hasNonTransportError('Error: fetch failed (retrying)'), false, 'transport-only error does not disqualify')

  // --- classifySpec -----------------------------------------------------------

  assert.equal(classifySpec('@deepseek-ai/dsh-some-plugin'), 'npm-name')
  assert.equal(classifySpec('dsh-better-sidebar'), 'npm-name')
  assert.equal(classifySpec('https://github.com/user/plugin.git'), 'git-url')
  assert.equal(classifySpec('git@github.com:user/plugin.git'), 'git-url')
  assert.equal(classifySpec('./examples/legacy-plugin'), 'directory')
  assert.equal(classifySpec('/abs/path/plugin'), 'directory')
  // A bare relative path that exists on disk is a directory, not a scoped npm name.
  assert.equal(classifySpec(join(here, '..')), 'directory')
  // A slashy token that is NOT an existing path and NOT scoped is unknown.
  assert.equal(classifySpec('no-such-dir/nor-npm'), 'unknown')
  assert.equal(classifySpec('not a spec!!'), 'unknown')

  // --- detectPluginStructure / isWebPlugin / listKeyFor (temp dirs) ------------

  const root = mkdtempSync(join(tmpdir(), 'verify-check-'))
  try {
    const pkgDir = join(root, 'pkg')
    mkdirSync(pkgDir)
    writeFileSync(join(pkgDir, 'package.json'), '{"name":"@demo/pkg"}')
    assert.equal(detectPluginStructure(pkgDir), 'package.json')
    assert.equal(isWebPlugin(pkgDir), false)
    assert.equal(listKeyFor(pkgDir, 'directory'), '@demo/pkg')
    // Corrupted package.json falls back to the ORIGINAL directory name, never
    // the temp copy name (which is always plugin-src).
    const brokenDir = join(root, 'broken-pkg')
    mkdirSync(brokenDir)
    writeFileSync(join(brokenDir, 'package.json'), 'not-json{')
    assert.equal(listKeyFor(join(root, 'copy-dest'), 'directory', brokenDir), 'broken-pkg')
    assert.equal(isWebPlugin(brokenDir), false)

    // git-url keys are repo names without .git, never the full URL.
    assert.equal(listKeyFor('https://github.com/user/plugin.git', 'git-url'), 'plugin')
    assert.equal(listKeyFor('git@github.com:user/plugin.git', 'git-url'), 'plugin')
    // npm-name keys are the package name itself.
    assert.equal(listKeyFor('@demo/pkg', 'npm-name'), '@demo/pkg')

    const webDir = join(root, 'web')
    mkdirSync(webDir)
    writeFileSync(join(webDir, 'package.json'), '{"name":"web-p","dsh":{"client":{"platform":"web"}}}')
    assert.equal(isWebPlugin(webDir), true)

    const cordisDir = join(root, 'cordis')
    mkdirSync(cordisDir)
    writeFileSync(join(cordisDir, 'cordis.yml'), '[]')
    assert.equal(detectPluginStructure(cordisDir), 'cordis.yml')
    assert.equal(listKeyFor(cordisDir, 'directory'), 'cordis', 'no package.json -> basename')

    const skillsDir = join(root, 'sk')
    mkdirSync(join(skillsDir, 'skills'), { recursive: true })
    assert.equal(detectPluginStructure(skillsDir), 'skills')

    const emptyDir = join(root, 'empty')
    mkdirSync(emptyDir)
    assert.equal(detectPluginStructure(emptyDir), null)
    assert.equal(detectPluginStructure(join(root, 'no-such-dir')), null)

    // A supported same-name collision must be surfaced from the actual CLI
    // installation ancestry; profile identity alone cannot prove bundle load.
    const cliRoot = join(root, 'cli')
    const cliBin = join(cliRoot, 'node_modules', '@deepseek-ai', 'dsh', 'lib')
    const cliBundle = join(cliRoot, 'node_modules', '@deepseek-ai', 'dsh-headless')
    mkdirSync(cliBin, { recursive: true })
    mkdirSync(cliBundle, { recursive: true })
    writeFileSync(join(cliBin, 'bin.js'), '')
    writeFileSync(join(cliBundle, 'package.json'), '{"name":"@deepseek-ai/dsh-headless"}')
    assert.equal(
      findPackageFromExecutable('@deepseek-ai/dsh-headless', join(cliBin, 'bin.js')),
      realpathSync(cliBundle),
      'same-name CLI installation bundle is detected from the target executable ancestry',
    )

    // A bare directory name with no slash must also resolve as a directory
    // (fleet-caught: "demo-old" was once mistaken for an npm name and 404'd).
    const bareDir = join(root, 'demo-old')
    mkdirSync(bareDir)
    assert.equal(classifySpec(bareDir), 'directory')

    // A same-named plain FILE must not hijack an npm spec into the directory route.
    writeFileSync(join(root, 'dsh-better-sidebar'), 'report content')
    const savedCwd = process.cwd()
    process.chdir(root)
    try {
      assert.equal(classifySpec('dsh-better-sidebar'), 'npm-name', 'file on disk does not hijack npm name')
    } finally {
      process.chdir(savedCwd)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

function cliCheck(scriptPath) {
  const run = (args) => spawnSync(process.execPath, [scriptPath, ...args], { encoding: 'utf8', timeout: 30_000 })

  const help = run(['--help'])
  assert.equal(help.status, 0, '--help exits 0')
  assert.match(help.stdout, /Exit codes: 0=pass\s+1=fail\s+2=inconclusive\s+3=skipped/)
  assert.match(help.stdout, /NOT a sandbox/, 'security boundary is stated in help')

  const noArgs = run([])
  assert.equal(noArgs.status, 2, 'no spec exits 2 (inconclusive)')

  // Argument validation: usage errors exit 2, never conflated with FAIL (1).
  for (const args of [['--timeout'], ['--timeout', 'abc', 'x'], ['--timeout', '0', 'x'], ['--bogus', 'x'], ['--profile'], ['--profile', '../escape', 'x'], ['x', 'extra']]) {
    const bad = run(args)
    assert.equal(bad.status, 2, `usage error exits 2: ${args.join(' ')}`)
    assert.match(bad.stderr, /verify-runtime:|Usage:/, `usage error is explained: ${args.join(' ')}`)
  }

  const root = mkdtempSync(join(tmpdir(), 'verify-model-check-'))
  try {
    const bin = join(root, 'bin')
    const plugin = join(root, 'plugin')
    const captured = join(root, 'profile.yml')
    mkdirSync(bin)
    mkdirSync(plugin)
    writeFileSync(join(plugin, 'package.json'), '{"name":"@demo/model-check","version":"1.0.0"}')
    const dsh = join(bin, 'dsh')
    writeFileSync(dsh, `#!/usr/bin/env node
const fs = require('node:fs'), path = require('node:path');
const args = process.argv.slice(2);
if (args[0] === '--version') { console.log('fixture-only'); process.exit(0); }
if (args.includes('--dump-config') || args.includes('install')) {
  const name = args[args.indexOf('--profile') + 1], dir = path.join(process.env.DSH_HOME, 'profiles', name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({private: true, dependencies: {}, dsh: {profile: {bundles: name === 'headless' ? ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-headless'] : ['@deepseek-ai/dsh-base']}}}));
  process.exit(0);
}
fs.copyFileSync(path.join(process.env.DSH_HOME, 'profiles', 'verify', 'cordis.patch.yml'), process.env.VERIFY_MODEL_CAPTURE);
process.exit(1);
`)
    chmodSync(dsh, 0o755)
    const result = spawnSync(process.execPath, [scriptPath, plugin, '--json'], {
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, VERIFY_MODEL_CAPTURE: captured },
      encoding: 'utf8',
      timeout: 30_000,
    })
    assert.equal(result.status, 1, 'fixture installer stops before any model request')
    assert.equal(JSON.parse(result.stdout).verdict, 'install-failed')
    const yaml = readFileSync(captured, 'utf8')
    assert.match(yaml, /^- id: llm-deepseek\n  config:\n    models:\n      - id: Qwen3\.6-35B\n        contextWindow: 262144\n        maxTokens: 8192$/m,
      'the actual DeepSeek provider entry must contain the probe model and its context and output limits')
    assert.match(yaml, /^- id: agent-default-model\n  config:\n    provider: deepseek-official\n    model: Qwen3\.6-35B$/m)
    assert.doesNotMatch(yaml, /^- id: llm-verify$/m, 'the obsolete provider entry must not remain alongside the real entry')
    assert.match(yaml, /- id: hmr\n\s+disabled: true/, 'generated profile disables the stock HMR entry')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

function pipelineCheck(scriptPath) {
  const root = mkdtempSync(join(tmpdir(), 'verify-pipeline-check-'))
  try {
    const bin = join(root, 'bin')
    const plugin = join(root, 'source')
    const log = join(root, 'commands.jsonl')
    mkdirSync(bin)
    mkdirSync(plugin)
    writeFileSync(join(plugin, 'package.json'), JSON.stringify({ name: '@demo/source-check', private: true, dsh: { bundle: { patch: './cordis.patch.yml' } } }))
    writeFileSync(join(plugin, 'cordis.patch.yml'), '[]\n')
    const before = readFileSync(join(plugin, 'package.json'), 'utf8')
    const dsh = join(bin, 'dsh')
    writeFileSync(dsh, `#!/usr/bin/env node
const fs = require('node:fs'), path = require('node:path');
const args = process.argv.slice(2), mode = process.env.VERIFY_FIXTURE_MODE;
if (args[0] === '--version') { console.log('0.1.2-alpha.2-fixture'); process.exit(0); }
fs.appendFileSync(process.env.VERIFY_FIXTURE_LOG, JSON.stringify({ args, home: process.env.DSH_HOME }) + '\\n');
if (args.includes('--from-default-profile')) { console.error('unsupported flag in legacy CLI'); process.exit(1); }
const name = args.includes('--profile') ? args[args.indexOf('--profile') + 1] : 'web';
const dir = path.join(process.env.DSH_HOME, 'profiles', name), file = path.join(dir, 'package.json');
function init() {
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify({name: 'native-' + name, private: true, dependencies: {}, dsh: {profile: {bundles: name === 'headless' && mode !== 'missing-runner' ? ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-headless'] : name === 'web' ? ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] : ['@deepseek-ai/dsh-base'], patchReload: name === 'headless' ? 'startup' : 'live'}}}));
}
if (args[0] === 'plugin' && args.includes('install')) {
  if (mode === 'bootstrap-failure') { console.error('native initialization failed'); process.exit(1); }
  if (!args.includes('-w')) { console.error('ERR_PNPM_ADDING_TO_ROOT'); process.exit(1); }
  init(); process.exit(0);
}
if (args.includes('--dump-config')) {
  if (!fs.existsSync(file) && !['headless', 'web'].includes(name)) { console.error('custom profile does not exist'); process.exit(1); }
  init(); process.exit(0);
}
if (args[0] === 'plugin' && args.includes('add')) {
  if (!args.includes('-w')) { console.error('ERR_PNPM_ADDING_TO_ROOT'); process.exit(1); }
  if (mode === 'install-failure') { console.error('native install failed'); process.exit(1); }
  init();
  const spec = args.slice(args.indexOf('add') + 1).find(value => !value.startsWith('-'));
  const local = fs.existsSync(spec), git = spec.replace(/^git\\+/, '').startsWith('http');
  const pkg = local ? JSON.parse(fs.readFileSync(path.join(spec, 'package.json'), 'utf8')) : { name: git ? '@demo/git-package' : spec.slice(0, spec.lastIndexOf('@')), version: mode === 'wrong-version' ? '9.9.9' : '1.2.3', dsh: { bundle: { patch: './cordis.patch.yml' } } };
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  manifest.dependencies[pkg.name] = local ? 'link:' + spec : git ? (mode === 'wrong-git-source' ? 'github:other/repository' : 'github:demo/repository') : '^1.2.3';
  if (mode !== 'not-enabled' && mode !== 'plain-dependency') manifest.dsh.profile.bundles.push(pkg.name);
  fs.writeFileSync(file, JSON.stringify(manifest));
  const target = path.join(dir, 'node_modules', pkg.name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (mode === 'manifest-only') process.exit(0);
  if (mode === 'broken-link') { fs.symlinkSync(path.join(dir, 'missing'), target); process.exit(0); }
  if (local && mode !== 'stale-source') fs.symlinkSync(spec, target);
  else {
    fs.mkdirSync(target, { recursive: true });
    if (mode === 'wrong-name') pkg.name = '@demo/unrelated';
    if (mode === 'plain-dependency') delete pkg.dsh;
    fs.writeFileSync(path.join(target, 'package.json'), JSON.stringify(pkg));
  }
  process.exit(0);
}
if (args[0] === 'plugin' && args.includes('list')) {
  if (mode === 'list-failure') { console.log('@demo/source-check'); process.exit(1); }
  process.exit(0);
}
const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
if (args[0] === 'web') {
  if (args.includes('--profile') || !manifest.dsh.profile.bundles.includes('@deepseek-ai/dsh-web-app')) process.exit(1);
} else if (!manifest.dsh.profile.bundles.includes('@deepseek-ai/dsh-headless')) { console.error('headless runner missing'); process.exit(1); }
if (mode === 'boot-failure') { console.error('Error: dsh: 1 entry did not activate'); process.exit(1); }
console.error('TRANSPORT ECONNREFUSED 127.0.0.1:9'); process.exit(1);
`)
    chmodSync(dsh, 0o755)
    const npm = join(bin, 'npm')
    writeFileSync(npm, '#!/bin/sh\nprintf "1.2.3\\n"\n')
    chmodSync(npm, 0o755)
    const run = (spec, mode, extra = []) => {
      writeFileSync(log, '')
      const child = spawnSync(process.execPath, [scriptPath, spec, '--json', ...extra], {
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, VERIFY_FIXTURE_MODE: mode, VERIFY_FIXTURE_LOG: log },
        encoding: 'utf8', timeout: 30_000,
      })
      assert.equal(child.error, undefined, `${mode}: verifier child completed`)
      const result = JSON.parse(child.stdout)
      const commands = readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
      if (!extra.includes('--keep-workspace')) {
        for (const home of new Set(commands.map(command => command.home))) assert.equal(existsSync(dirname(home)), false, `${mode}: temporary home removed`)
      }
      return { child, result, commands }
    }
    for (const [spec, mode, extra] of [[plugin, 'valid', []], [plugin, 'valid', ['--profile', 'custom-check']], [plugin, 'valid', ['--profile', 'headless']], ['@demo/npm-package', 'valid', []], ['https://github.com/demo/repository.git', 'valid', []], ['git+https://github.com/demo/repository.git', 'valid', []]]) {
      const { child, result, commands } = run(spec, mode, extra)
      assert.equal(child.status, 0, `${spec}: complete pipeline passes`)
      assert.equal(result.verdict, 'pass-boot-probe')
      assert(result.stages.every(stage => stage.ok))
      assert(commands.filter(command => command.args.includes('add')).every(command => command.args.includes('-w')))
      assert.equal(result.installation.name, /^(?:git\+)?https:/.test(spec) ? '@demo/git-package' : spec.startsWith('@') ? spec : '@demo/source-check')
      if (/^(?:git\+)?https:/.test(spec)) assert(commands.find(command => command.args.includes('add')).args.some(argument => argument.startsWith('git+https:')), 'HTTP Git input reaches the real Git installer')
    }
    for (const [spec, mode] of [[plugin, 'manifest-only'], [plugin, 'broken-link'], [plugin, 'stale-source'], [plugin, 'list-failure'], [plugin, 'not-enabled'], ['@demo/npm-package', 'wrong-name'], ['@demo/npm-package', 'wrong-version'], ['@demo/npm-package', 'plain-dependency'], ['https://github.com/demo/repository.git', 'wrong-git-source']]) {
      const { child, result, commands } = run(spec, mode)
      assert.equal(child.status, 1, `${mode}: failed installation state is not PASS`)
      assert.equal(result.verdict, 'not-listed-after-install', mode)
      assert.equal(commands.some(command => command.args.includes('ok') || command.args[0] === 'web'), false, `${mode}: no boot`)
    }
    for (const mode of ['bootstrap-failure', 'missing-runner']) {
      const { child, result, commands } = run(plugin, mode)
      assert.equal(child.status, 2, `${mode}: bootstrap cannot be attributed to plugin`)
      assert.equal(result.verdict, 'profile-bootstrap-failed')
      assert.equal(commands.some(command => command.args.includes('add')), false)
    }
    assert.equal(run(plugin, 'install-failure').result.verdict, 'install-failed')
    assert.equal(run(plugin, 'boot-failure').result.verdict, 'activation-failed')
    const alias = join(root, 'source-link')
    symlinkSync(plugin, alias)
    assert.equal(run(alias, 'valid').child.status, 0, 'symlinked source is copied without changing its identity')
    const kept = run(plugin, 'valid', ['--keep-workspace'])
    assert(existsSync(kept.result.workspace), 'explicit keep retains the owned home')
    rmSync(kept.result.workspace, { recursive: true, force: true })
    const web = JSON.parse(before)
    web.dsh.client = { platform: 'web' }
    writeFileSync(join(plugin, 'package.json'), JSON.stringify(web))
    const result = run(plugin, 'valid')
    assert.equal(result.child.status, 0, 'web host path preserved')
    assert(result.commands.some(command => command.args[0] === 'web' && !command.args.includes('--profile')))
    writeFileSync(join(plugin, 'package.json'), before)
    assert.equal(readFileSync(join(plugin, 'package.json'), 'utf8'), before, 'verification did not mutate the source')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

const isMain = (() => {
  try {
    return realpathSync(process.argv[1] ?? '') === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
})()

if (isMain) {
  runVerifyRuntimeChecks()
  cliCheck(join(here, 'verify-runtime.mjs'))
  pipelineCheck(join(here, 'verify-runtime.mjs'))
  console.log('verify-runtime.check: all assertions passed')
}
