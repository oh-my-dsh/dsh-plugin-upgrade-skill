/**
 * Tests for scripts/dsh-skin-migrate-v2.mjs — the v1 -> v2 skin migration
 * codemod (issue #506). Unit tests cover the pure transforms; integration
 * tests migrate a fixture skin (all v1 field shapes) and the real harbor /
 * maid-atelier packages read-only.
 *
 * Note on runSkinCssSafety: transformSkinCss is exercised through the real
 * skin-center pipeline. lightningcss 1.32/1.33 cannot serialize a rule whose
 * declarations contain var() once the style visitor returns the rule, so
 * var()-bearing stylesheets crash the pipeline today; the codemod reports
 * that as crash:true, distinct from a whitelist violation. The integration
 * fixtures here are var()-free so they exercise the pass path.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  HOOKS_API_VERSION,
  buildManifestV2,
  classifySelector,
  extractImageConstants,
  extractScrims,
  loadManifestValidator,
  migrateSkin,
  normalizeStylesheet,
  runSkinCssSafety,
  splitStylesheet,
} from './dsh-skin-migrate-v2.mjs'

const ONE_PIXEL_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
// Assembled without literals so the fixture bundle keeps its template form.
const BT = String.fromCharCode(96) // backtick
const D = '$'

/** A throwaway v1 skin package covering every migration path. */
function fixtureSkin() {
  const dir = mkdtempSync(join(tmpdir(), 'skin-migrate-fixture-'))
  mkdirSync(join(dir, 'lib'), { recursive: true })
  mkdirSync(join(dir, 'preview'), { recursive: true })
  mkdirSync(join(dir, 'assets'), { recursive: true })
  writeFileSync(join(dir, 'preview', 'light.png'), Buffer.from(ONE_PIXEL_PNG, 'base64'))
  writeFileSync(join(dir, 'preview', 'dark.png'), Buffer.from(ONE_PIXEL_PNG, 'base64'))
  writeFileSync(join(dir, 'assets', 'decoration.webp'), Buffer.from(ONE_PIXEL_PNG))
  writeFileSync(join(dir, 'LICENSE'), 'fixture license\n')
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    name: '@linxin666/dsh-client-ui-skin-fixture-skin',
    version: '0.3.1',
  }))
  writeFileSync(join(dir, 'skin.json'), JSON.stringify({
    id: 'fixture-skin',
    name: '夹具皮肤',
    nameEn: 'Fixture Skin',
    author: 'codemod-test',
    tagline: 'fixture tagline',
    description: 'fixture description',
    tags: ['fixture', 'test'],
    accent: '#aabbcc',
    order: 5,
    license: 'CC0-1.0',
    licenseUrl: 'https://example.test/license',
    noticeUrl: 'https://example.test/notice',
    sourceUrl: 'https://example.test/source',
    attribution: 'fixture artist',
    bodyAttr: 'data-dsh-fixture',
    package: '@linxin666/dsh-client-ui-skin-fixture-skin',
    wiring: { id: 'ui-skin-fixture-skin', bundleWired: false },
    preview: {
      light: 'packages/skins/fixture-skin/preview/light.png',
      dark: 'packages/skins/fixture-skin/preview/dark.png',
    },
  }, null, 2))
  const css = [
    'body[data-dsh-fixture]{color:#fff;--dsw-skin-paper:#fefefe}',
    'body[data-dsh-fixture][data-ds-dark-theme]{color:#111}',
    'body[data-dsh-fixture] [data-slot="conversation.composer"]{top:0}',
    'body[data-dsh-fixture] .card{background:#222}',
    'body[data-dsh-fixture]{--dsw-static-dead:#123456}',
  ].join('')
  const bundle = [
    'window.__ModuleLoader__.load({',
    '  factory: (require) => {',
    '    const FIXTURE_ART = "data:image/png;base64,' + ONE_PIXEL_PNG + '"',
    '    const FIXTURE_ICON = ' + BT + 'data:image/svg+xml;utf8,' + D + '{encodeURIComponent([',
    '      "<svg xmlns=\\"http://www.w3.org/2000/svg\\" width=\\"16\\" height=\\"16\\"></svg>"',
    '    ].join(""))}' + BT,
    '    const SCRIM_LIGHT = ["linear-gradient(rgba(1, 2, 3, 0.1) 0%, rgba(1, 2, 3, 0.2) 100%)"].join(", ")',
    '    const SCRIM_DARK = ["linear-gradient(rgba(4, 5, 6, 0.4) 0%, rgba(4, 5, 6, 0.6) 100%)"].join(", ")',
    '    //#region ' + String.fromCharCode(0) + 'dsh-css:packages/skins/fixture-skin/src/client/fixture.module.css.mjs',
    '    const css = ' + JSON.stringify(css),
    '    //#endregion',
    '  },',
    '})',
  ].join('\n')
  writeFileSync(join(dir, 'lib', 'client.js'), bundle)
  return dir
}

async function migrateFixture() {
  const skinDir = fixtureSkin()
  const outDir = mkdtempSync(join(tmpdir(), 'skin-migrate-out-'))
  const report = await migrateSkin({ skinDir, outDir, write: true })
  return { skinDir, outDir, report }
}

test('bodyAttr scope prefixes are stripped from every selector', async () => {
  const { outDir, report } = await migrateFixture()
  assert.equal(report.ok, true, report.errors.join('; '))
  assert.equal(report.css.scopeStripped, 5)
  const skinCss = readFileSync(join(outDir, 'skin.css'), 'utf8')
  const patchesCss = readFileSync(join(outDir, 'patches.css'), 'utf8')
  assert.ok(!skinCss.includes('data-dsh-fixture'), 'skin.css must not reference the v1 bodyAttr')
  assert.ok(!patchesCss.includes('data-dsh-fixture'), 'patches.css must not reference the v1 bodyAttr')
  assert.ok(skinCss.includes(':root'), 'bare scope rules become :root')
  assert.ok(
    skinCss.includes('body[data-ds-dark-theme]'),
    'theme-qualified rules keep the body anchor (data-ds-dark-theme lives on body)',
  )
})

test('skin-private --dsw-skin-* variables are renamed, dead ones dropped', async () => {
  const { outDir, report } = await migrateFixture()
  assert.equal(report.ok, true, report.errors.join('; '))
  assert.equal(report.css.renamedVarRefs, 1)
  const skinCss = readFileSync(join(outDir, 'skin.css'), 'utf8')
  assert.ok(!skinCss.includes('--dsw-skin-'), 'no --dsw-skin-* survives')
  assert.ok(!skinCss.includes('--dsw-static-dead'), 'zero-consumer static scale is deleted')
  assert.ok(report.css.deadVarsRemoved.includes('--dsw-static-dead'))
  assert.ok(report.css.deadVarsRemoved.includes('--dsh-skin-paper'))
})

test('semantic anchors rewrite to L2 attributes; free selectors go to patches.css', async () => {
  const { outDir, report } = await migrateFixture()
  assert.equal(report.ok, true, report.errors.join('; '))
  const skinCss = readFileSync(join(outDir, 'skin.css'), 'utf8')
  const patchesCss = readFileSync(join(outDir, 'patches.css'), 'utf8')
  assert.ok(skinCss.includes('[data-dsh-surface="composer"]'))
  assert.ok(!skinCss.includes('.card'), 'class selectors must not stay in skin.css')
  assert.ok(patchesCss.includes('.card'))
  assert.ok(report.css.semanticRewrites >= 1)
})

test('deprecated v1 fields are dropped; license fields are kept', async () => {
  const { report } = await migrateFixture()
  assert.equal(report.ok, true, report.errors.join('; '))
  const manifest = report.manifest
  assert.equal(manifest.skinManifestVersion, 2)
  assert.equal(manifest.package, undefined)
  assert.equal(manifest.wiring, undefined)
  assert.equal(manifest.bodyAttr, undefined)
  assert.equal(manifest.license, 'CC0-1.0')
  assert.equal(manifest.licenseUrl, 'https://example.test/license')
  assert.equal(manifest.noticeUrl, 'https://example.test/notice')
  assert.equal(manifest.sourceUrl, 'https://example.test/source')
  assert.equal(manifest.attribution, 'fixture artist')
  assert.equal(manifest.version, '0.3.1', 'version comes from the v1 package.json')
  assert.deepEqual(manifest.preview, { light: 'preview/light.png', dark: 'preview/dark.png' })
  assert.deepEqual(report.droppedFields.sort(), ['bodyAttr', 'package', 'wiring'])
})

test('products pass validateSkinManifestV2 and transformSkinCss', async () => {
  const { outDir, report } = await migrateFixture()
  assert.equal(report.ok, true, report.errors.join('; '))
  const validateSkinManifestV2 = await loadManifestValidator()
  const written = JSON.parse(readFileSync(join(outDir, 'skin.json'), 'utf8'))
  const manifestResult = validateSkinManifestV2(written)
  assert.equal(manifestResult.ok, true, manifestResult.errors.join('; '))
  const skinCss = await runSkinCssSafety(readFileSync(join(outDir, 'skin.css'), 'utf8'), { skinId: 'fixture-skin', filename: 'skin.css' })
  assert.equal(skinCss.ok, true, skinCss.error || (skinCss.violations || []).join('; '))
  const patchesCss = await runSkinCssSafety(readFileSync(join(outDir, 'patches.css'), 'utf8'), { skinId: 'fixture-skin', filename: 'patches.css' })
  assert.equal(patchesCss.ok, true, patchesCss.error || (patchesCss.violations || []).join('; '))
})

test('backdrop art maps to backgroundMedia; favicon and assets are shipped; hooks drafted', async () => {
  const { outDir, report } = await migrateFixture()
  assert.equal(report.ok, true, report.errors.join('; '))
  const media = report.manifest.contributes.backgroundMedia
  assert.equal(media.light.type, 'image')
  assert.equal(media.light.src, 'assets/fixture-art.png')
  assert.equal(media.light.scrim, 'linear-gradient(rgba(1, 2, 3, 0.1) 0%, rgba(1, 2, 3, 0.2) 100%)')
  assert.equal(media.dark.scrim, 'linear-gradient(rgba(4, 5, 6, 0.4) 0%, rgba(4, 5, 6, 0.6) 100%)')
  assert.deepEqual(readFileSync(join(outDir, 'assets', 'fixture-art.png')), Buffer.from(ONE_PIXEL_PNG, 'base64'))
  assert.ok(existsSync(join(outDir, 'assets', 'fixture-icon.svg')))
  assert.ok(existsSync(join(outDir, 'assets', 'decoration.webp')), 'existing assets/ dir is copied')
  assert.ok(existsSync(join(outDir, 'preview', 'light.png')))
  assert.ok(existsSync(join(outDir, 'LICENSE')))
  const hooks = readFileSync(join(outDir, 'hooks.mjs'), 'utf8')
  assert.ok(hooks.includes('export default function defineSkinHooks()'))
  assert.ok(hooks.includes('TODO'), 'the draft must carry TODO markers for manual review')
  assert.ok(hooks.includes('assets/fixture-icon.svg'))
  assert.equal(report.manifest.facets.client.entry, 'hooks.mjs')
  assert.equal(report.manifest.facets.client.apiVersion, HOOKS_API_VERSION)
  assert.deepEqual(report.manifest.requires.contracts, [
    { apiVersion: HOOKS_API_VERSION, kind: 'SkinHooks', optional: true },
  ])
})

test('check mode writes nothing', async () => {
  const skinDir = fixtureSkin()
  const outDir = join(skinDir, 'should-not-exist')
  const report = await migrateSkin({ skinDir, outDir, write: false })
  assert.equal(report.ok, true, report.errors.join('; '))
  assert.ok(!existsSync(outDir))
})

// --- unit tests ----------------------------------------------------------------

test('classifySelector separates L1/L2 core selectors from L3 free selectors', () => {
  const core = [
    ':root',
    'body[data-ds-dark-theme]',
    '[data-dsh-surface="composer"]',
    '[data-dsh-plugin="ssh"] [data-dsh-part="terminal"]',
    'body::-webkit-scrollbar-thumb',
  ]
  for (const sel of core) {
    assert.equal(classifySelector(sel).core, true, sel + ' should be core')
  }
  const patch = [
    ['.card', 'class'],
    ['[id=root]', 'id attribute'],
    ['a', 'bare element'],
    [':focus-visible', 'no anchor'],
    ['::-webkit-scrollbar', 'no anchor'],
    ['[data-phase=active] [class*=composerSeat]', 'hash class reliance'],
  ]
  for (const [sel, why] of patch) {
    assert.equal(classifySelector(sel).core, false, sel + ' should be a patch (' + why + ')')
  }
})

test('normalizeStylesheet renames --dsw-skin-* and strips the scope', () => {
  const stats = normalizeStylesheet(
    'body[data-dsh-x]{--dsw-skin-a:1px}body[data-dsh-x] .y{color:#fff}',
    { bodyAttr: 'data-dsh-x' },
  )
  assert.equal(stats.renamedVars, 1)
  assert.ok(stats.css.includes('--dsh-skin-a'))
  assert.ok(!stats.css.includes('--dsw-skin-'))
  assert.ok(stats.css.includes(':root'))
  assert.equal(stats.scopeStripped, 2)
})

test('splitStylesheet routes keyframes to the file that references them', () => {
  const { core, patches, stats } = splitStylesheet([
    ':root {',
    '  animation: demo-spin 1s;',
    '}',
    '.card {',
    '  animation: demo-pulse 1s;',
    '}',
    '@keyframes demo-spin {',
    '  from {',
    '    opacity: 0;',
    '  }',
    '}',
    '@keyframes demo-pulse {',
    '  from {',
    '    opacity: 0;',
    '  }',
    '}',
    '@keyframes demo-unused {',
    '  from {',
    '    opacity: 0;',
    '  }',
    '}',
  ].join('\n'))
  assert.ok(core.includes('@keyframes demo-spin'))
  assert.ok(!core.includes('demo-pulse'))
  assert.ok(patches.includes('@keyframes demo-pulse'))
  assert.deepEqual(stats.keyframesDropped, ['demo-unused'])
})

test('extractImageConstants reads base64 and svg-template forms; extractScrims reads scrims', () => {
  const bundle = [
    'const BIG_ART = "data:image/webp;base64,' + ONE_PIXEL_PNG + '"',
    'const SMALL_ICON = ' + BT + 'data:image/svg+xml;utf8,' + D + '{encodeURIComponent(["<svg xmlns=\\"x\\"></svg>"].join(""))}' + BT,
    'const SCRIM_LIGHT = ["linear-gradient(rgba(0,0,0,0.1) 0%)"].join(", ")',
  ].join('\n')
  const images = extractImageConstants(bundle)
  assert.equal(images.length, 2)
  assert.equal(images.find((i) => i.name === 'BIG_ART').file, 'assets/big-art.webp')
  assert.equal(images.find((i) => i.name === 'SMALL_ICON').svg, '<svg xmlns="x"></svg>')
  assert.equal(extractScrims(bundle).light, 'linear-gradient(rgba(0,0,0,0.1) 0%)')
})

test('buildManifestV2 omits optional blocks when unused', () => {
  const manifest = buildManifestV2(
    { id: 'demo', name: 'n', nameEn: 'n', author: 'a', package: 'x', wiring: {}, bodyAttr: 'y' },
    { version: '1.0.0', backgroundMedia: null, hasPatches: false, hasHooks: false },
  )
  assert.equal(manifest.skinManifestVersion, 2)
  assert.deepEqual(manifest.contributes, { stylesheet: 'skin.css' })
  assert.equal(manifest.facets, undefined)
  assert.equal(manifest.requires, undefined)
})

test('runSkinCssSafety distinguishes pipeline crashes from whitelist violations', async () => {
  // The skin-center pipeline is two-pass (text-level scoping + read-only
  // lightningcss validation), so var()-bearing CSS is fine; a genuine parse
  // error still reports as a crash, and a whitelist breach as a violation.
  const varCss = await runSkinCssSafety('body{color:var(--b)}', { skinId: 'demo' })
  assert.equal(varCss.ok, true, JSON.stringify(varCss))
  const crash = await runSkinCssSafety('body{color', { skinId: 'demo' })
  assert.equal(crash.ok, false)
  assert.equal(crash.crash, true)
  const violation = await runSkinCssSafety('@import "https://evil.example/x.css";', { skinId: 'demo' })
  assert.equal(violation.ok, false)
  assert.equal(violation.crash, false)
  assert.ok(violation.violations.length > 0)
})

// --- real skins ------------------------------------------------------------------
// The real-skin migration cases were retired together with the v1 skin
// packages they read (issue #506, M3): the codemod is a one-shot tool and
// its subjects no longer exist in the repository. The fixture-driven cases
// above keep the migration behavior pinned.
