#!/usr/bin/env node
/**
 * dsh-skin-migrate-v2 — one-shot codemod: migrate a v1 skin package
 * (packages/skins/<id>/: skin.json v1 + lib/client.js cordis bundle) into a
 * v2 pure-asset directory (skin.json v2 + skin.css + optional patches.css /
 * hooks.mjs / assets/ + preview/) loaded by the skin-center (issue #506).
 *
 * Usage:
 *   node scripts/dsh-skin-migrate-v2.mjs <skinDir> --out <outDir>   # write
 *   node scripts/dsh-skin-migrate-v2.mjs <skinDir> --check          # validate only
 *
 * --check runs the full migration in memory and validates the products
 * against the skin-center contracts (validateSkinManifestV2 +
 * transformSkinCss) without writing anything; exit code is non-zero on any
 * failure. Write mode validates first and refuses to write invalid output.
 *
 * What the codemod does (the v1 -> v2 mapping table):
 *   - extracts the shipped stylesheet from the bundle's dsh-css region
 *     (the "const css = ..." payload injected as a style tag), normalized
 *     through lightningcss;
 *   - strips the v1 bodyAttr scope prefix (body[data-dsh-<id>]); bare token
 *     rules become :root, theme-qualified rules keep a body[data-ds-dark-*]
 *     anchor (the attribute lives on body in the official client);
 *   - rewrites official DOM anchors to the L2 semantic attributes
 *     (contracts/semantic-attrs-v1.md) where an exact mapping exists;
 *   - splits the result: L1 tokens + L2 semantic rules go to skin.css,
 *     everything with free selectors (classes, ids, hash-class reliance,
 *     unmapped attributes) goes to patches.css;
 *   - renames skin-private --dsw-skin-* custom properties to --dsh-skin-*
 *     and deletes --dsh-skin-* / --dsw-static-* definitions with zero
 *     consumers (dead color scales);
 *   - extracts inlined data-URL artwork to assets/ files and maps the
 *     backdrop art + light/dark scrims to contributes.backgroundMedia;
 *   - drafts hooks.mjs for the JS effects that cannot be migrated
 *     statically (favicon injection is drafted; everything else is a TODO
 *     comment for manual review);
 *   - builds skin.json v2: drops the deprecated package/wiring/bodyAttr
 *     fields, keeps the first-class license fields, rewrites preview paths
 *     to skin-directory-relative and copies the referenced files.
 *
 * The codemod never modifies the source skin directory.
 */
import { execFileSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, join, relative, resolve as resolvePath } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolvePath(SCRIPT_DIR, '..')
const SKIN_CENTER = join(REPO_ROOT, 'packages', 'skins', 'skin-center')
const VALIDATE_URL = pathToFileURL(join(SKIN_CENTER, 'src/core/manifest-v2/validate.ts')).href
const TRANSFORM_URL = pathToFileURL(join(SKIN_CENTER, 'src/core/css-safety/transform.ts')).href

/** Hooks runtime contract tag (contracts/hooks-api.d.ts). */
export const HOOKS_API_VERSION = 'x-org.linxin666.skin-center/v1alpha1'

/** lightningcss ships with the skin-center package (native dep, host-side). */
const skinCenterRequire = createRequire(join(SKIN_CENTER, 'package.json'))
const { transform: lightningTransform } = skinCenterRequire('lightningcss')

// --- contract bridges ---------------------------------------------------------

/**
 * validateSkinManifestV2 is erasable-syntax TypeScript, so a current node
 * imports it directly. transformSkinCss uses a non-erasable parameter
 * property; when the runtime cannot strip it, fall back to a child process
 * with --experimental-transform-types so the codemod works under any node.
 */
let validateCache = null
export async function loadManifestValidator() {
  if (!validateCache) {
    const mod = await import(VALIDATE_URL)
    validateCache = mod.validateSkinManifestV2
  }
  return validateCache
}

let transformModule = null
async function loadTransformDirect() {
  if (transformModule === null) {
    try {
      transformModule = await import(TRANSFORM_URL)
    } catch (err) {
      if (err && err.code === 'ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX') transformModule = false
      else throw err
    }
  }
  return transformModule || null
}

const TRANSFORM_CHILD_SNIPPET = [
  "let input = ''",
  "process.stdin.on('data', (c) => { input += c })",
  "process.stdin.on('end', async () => {",
  '  const { css, options } = JSON.parse(input)',
  '  const mod = await import(' + JSON.stringify(TRANSFORM_URL) + ')',
  '  try {',
  '    const res = mod.transformSkinCss(css, options)',
  "    process.stdout.write(JSON.stringify({ ok: true, code: res.code, warnings: res.warnings }))",
  '  } catch (err) {',
  '    process.stdout.write(JSON.stringify({',
  '      ok: false,',
  '      crash: !err || err.name !== ' + JSON.stringify('SkinCssSafetyError') + ',',
  '      error: String(err && err.message ? err.message : err),',
  '      violations: err && err.violations ? err.violations : [],',
  '    }))',
  '  }',
  '})',
].join('\n')

/**
 * Run the skin-center CSS safety pipeline on a stylesheet. Returns
 * { ok, code?, warnings, violations? } — never throws on whitelist
 * violations (ok:false instead), only on unexpected errors.
 */
export async function runSkinCssSafety(css, options) {
  const direct = await loadTransformDirect()
  if (direct) {
    try {
      const res = direct.transformSkinCss(css, options)
      return { ok: true, code: res.code, warnings: res.warnings }
    } catch (err) {
      if (err && err.name === 'SkinCssSafetyError') {
        return { ok: false, crash: false, warnings: [], violations: err.violations, error: err.message }
      }
      // A non-SkinCssSafetyError throw is a pipeline crash, not a product
      // defect. lightningcss 1.32/1.33 fails to serialize any rule whose
      // declarations contain var() once the style visitor returns the rule,
      // so every var()-bearing stylesheet crashes the M2 pipeline today.
      return { ok: false, crash: true, warnings: [], violations: [], error: String(err && err.message ? err.message : err) }
    }
  }
  const out = execFileSync(
    process.execPath,
    ['--experimental-transform-types', '--input-type=module', '-e', TRANSFORM_CHILD_SNIPPET],
    { input: JSON.stringify({ css, options }), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  )
  return JSON.parse(out)
}

// --- bundle extraction --------------------------------------------------------

/** Decode one JS double-quoted string literal starting at text[start] === '"'. */
function readJsString(text, start) {
  let i = start + 1
  let escaped = false
  while (i < text.length) {
    const ch = text[i]
    if (escaped) escaped = false
    else if (ch === '\\') escaped = true
    else if (ch === '"') break
    i++
  }
  return { raw: text.slice(start, i + 1), end: i + 1 }
}

function readdirSyncSafe(dir) {
  try {
    return readdirSync(dir).sort()
  } catch {
    return []
  }
}

/**
 * Extract the shipped stylesheets from a v1 bundle: every dsh-css region
 * carries one "const css = ..." payload that the loader injects as a style
 * tag. Returns { payloads: [{ source, css }], origin }. Falls back to the
 * src CSS modules when the bundle carries no dsh-css region.
 */
function extractCssPayloads(bundleText, skinDir) {
  const payloads = []
  let searchFrom = 0
  for (;;) {
    const marker = bundleText.indexOf('dsh-css:', searchFrom)
    if (marker === -1) break
    searchFrom = marker + 'dsh-css:'.length
    const regionEnd = bundleText.indexOf('\n', marker)
    const source = bundleText
      .slice(marker + 'dsh-css:'.length, regionEnd === -1 ? undefined : regionEnd)
      .trim()
    const constAt = bundleText.indexOf('const css = ', marker)
    if (constAt === -1 || (regionEnd !== -1 && constAt > regionEnd + 80)) continue
    const quoteAt = bundleText.indexOf('"', constAt)
    if (quoteAt === -1) continue
    const { raw } = readJsString(bundleText, quoteAt)
    payloads.push({ source, css: JSON.parse(raw) })
  }
  if (payloads.length > 0) return { payloads, origin: 'bundle' }
  // Fallback: read the CSS modules straight from src (pre-bundle form).
  const srcClient = join(skinDir, 'src', 'client')
  const fallback = []
  for (const entry of readdirSyncSafe(srcClient)) {
    if (entry.endsWith('.css')) {
      fallback.push({ source: 'src/client/' + entry, css: readFileSync(join(srcClient, entry), 'utf8') })
    }
  }
  return { payloads: fallback, origin: 'src' }
}

const MIME_EXT = { webp: 'webp', png: 'png', jpeg: 'jpg', jpg: 'jpg', gif: 'gif', 'svg+xml': 'svg' }

/**
 * Extract inlined image constants from the bundle:
 *  - base64 form: const NAME = "data:image/<mime>;base64,...."
 *  - svg form:    const NAME = a data:image/svg+xml;utf8 template literal
 *    wrapping encodeURIComponent([...].join(""))
 * Returns [{ name, file, mime, bytes, svg? }] where file is the suggested
 * assets/ relative path.
 */
export function extractImageConstants(bundleText) {
  const found = []
  const base64Re = /const\s+([A-Z][A-Z0-9_]*)\s*=\s*["\x60](data:image\/([a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+))["\x60]/g
  for (const m of bundleText.matchAll(base64Re)) {
    const [, name, , mime, data] = m
    found.push({
      name,
      mime,
      bytes: Buffer.from(data, 'base64'),
      file: 'assets/' + name.toLowerCase().replace(/_/g, '-') + '.' + (MIME_EXT[mime] || 'bin'),
    })
  }
  const svgRe = /const\s+([A-Z][A-Z0-9_]*)\s*=\s*\x60data:image\/svg\+xml;utf8,\$\{encodeURIComponent\(\[([\s\S]*?)\]\.join\((""|'')\)\)\}\x60/g
  for (const m of bundleText.matchAll(svgRe)) {
    const [, name, arrayBody] = m
    const parts = []
    for (const sm of arrayBody.matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
      parts.push(JSON.parse('"' + sm[1] + '"'))
    }
    if (parts.length === 0) continue
    const svg = parts.join('')
    found.push({
      name,
      mime: 'svg+xml',
      bytes: Buffer.from(svg, 'utf8'),
      svg,
      file: 'assets/' + name.toLowerCase().replace(/_/g, '-') + '.svg',
    })
  }
  return found
}

/** Extract SCRIM_LIGHT / SCRIM_DARK backdrop scrims from the bundle. */
export function extractScrims(bundleText) {
  const scrims = {}
  const re = /const\s+SCRIM_(LIGHT|DARK)\s*=\s*\[((?:\s*"(?:[^"\\]|\\.)*",?\s*)+)\]\.join\((?:", "|', ')\)/g
  for (const m of bundleText.matchAll(re)) {
    const parts = []
    for (const sm of m[2].matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
      parts.push(JSON.parse('"' + sm[1] + '"'))
    }
    scrims[m[1].toLowerCase()] = parts.join(', ')
  }
  return scrims
}

/**
 * Detect JS effect leftovers that the codemod cannot migrate statically.
 * Returns human-readable TODO bullets for the hooks.mjs draft.
 */
function detectJsEffectTodos(bundleText, { backdropMigrated, faviconFound }) {
  const todos = []
  const styleTags = (bundleText.match(/createElement\("style"\)/g) || []).length
  // One style tag is the css-modules loader; more means the skin builds its
  // own CSS text in JS (template literals with interpolated assets).
  if (styleTags > 1) {
    todos.push('the v1 bundle builds extra stylesheet(s) in JS (template literals with interpolated assets); port them to patches.css with relative asset URLs or to hooks code')
  }
  if (/createElement\("canvas"\)/.test(bundleText) || /requestAnimationFrame/.test(bundleText)) {
    todos.push('canvas / animation-frame effect detected (e.g. ambient overlay); port it to hooks using ctx.layers (all layers are pointer-events:none)')
  }
  if (/MutationObserver/.test(bundleText) && !backdropMigrated) {
    todos.push('MutationObserver logic detected; decide what it watched (theme flips are covered by backgroundMedia light/dark) and port the rest')
  }
  if (/localStorage/.test(bundleText)) {
    todos.push('localStorage access detected; skins have no storage facet in v2 - port state into hooks with an explicit owner')
  }
  if (/createElement\("link"\)/.test(bundleText) && !faviconFound) {
    todos.push('a link element is injected (favicon or stylesheet); port it to hooks or drop it')
  }
  return todos
}

// --- selector rewriting (component level, via lightningcss) -------------------

/**
 * Exact official-DOM-anchor to semantic-attribute mappings, from
 * contracts/semantic-attrs-v1.md. Key: "name" (presence) or "name=value".
 */
const SEMANTIC_EXACT = new Map(Object.entries({
  'data-slot=root': ['data-dsh-surface', 'root'],
  'data-slot=sidebar': ['data-dsh-surface', 'sidebar'],
  'data-slot=conversation': ['data-dsh-surface', 'conversation'],
  'data-slot=conversation.session.header': ['data-dsh-surface', 'session-header'],
  'data-slot=conversation.composer': ['data-dsh-surface', 'composer'],
  'data-slot=details': ['data-dsh-surface', 'details'],
  'data-slot=shell.overlay': ['data-dsh-surface', 'overlay'],
  'data-shell-overlay': ['data-dsh-surface', 'overlay'],
  'data-chat-flow-kind': ['data-dsh-part', 'message-row'],
  'data-streaming': ['data-dsh-part', 'message-body'],
  'data-conversation-scroll': ['data-dsh-part', 'scrollport'],
  'data-decoration=chip': ['data-dsh-part', 'composer-chip'],
  'data-queue-dock': ['data-dsh-part', 'queue-dock'],
  'data-turn-tail': ['data-dsh-part', 'turn-tail'],
  'data-side': ['data-dsh-part', 'resize-handle'],
  'data-dsh-taskboard-view': ['data-dsh-plugin', 'task-board'],
  'data-dsh-taskboard-entry': ['data-dsh-plugin', 'task-board'],
  'data-dsh-ssh-view': ['data-dsh-plugin', 'ssh'],
  'data-dsh-ssh-entry': ['data-dsh-plugin', 'ssh'],
  'data-gitgraph-chip-anchor': ['data-dsh-part', 'chip'],
  'data-gitgraph-dialog': ['data-dsh-part', 'dialog'],
  'data-dsh-pet-root': ['data-dsh-plugin', 'pet'],
}))

/** Escape a string for use inside a RegExp. */
function escapeRegExp(s) {
  return s.replace(/[.*+?^$(){}|[\]\\]/g, '\\$&')
}

/**
 * (regex, replacement, label) triples derived from SEMANTIC_EXACT, longest
 * attribute values first so e.g. conversation.session.header wins over any
 * prefix collision. textarea[data-phase] is a compound anchor and goes first.
 */
const SEMANTIC_TEXT_REWRITES = (() => {
  const rules = [{
    re: /textarea\s*\[\s*data-phase\s*\]/g,
    replacement: '[data-dsh-part="composer-input"]',
    label: 'textarea[data-phase] -> [data-dsh-part="composer-input"]',
  }]
  const entries = [...SEMANTIC_EXACT.entries()].sort((a, b) => b[0].length - a[0].length)
  for (const [key, [name, value]] of entries) {
    const eq = key.indexOf('=')
    if (eq === -1) {
      rules.push({
        re: new RegExp('\\[\\s*' + escapeRegExp(key) + '\\s*\\]', 'g'),
        replacement: '[' + name + '="' + value + '"]',
        label: '[' + key + '] -> [' + name + '="' + value + '"]',
      })
    } else {
      const attr = key.slice(0, eq)
      const val = key.slice(eq + 1)
      rules.push({
        re: new RegExp('\\[\\s*' + escapeRegExp(attr) + '\\s*=\\s*(?:"' + escapeRegExp(val) + '"|\'' + escapeRegExp(val) + '\'|' + escapeRegExp(val) + ')\\s*\\]', 'g'),
        replacement: '[' + name + '="' + value + '"]',
        label: '[' + attr + '="' + val + '"] -> [' + name + '="' + value + '"]',
      })
    }
  }
  return rules
})()

/**
 * Rewrite one selector text: strip the v1 scope prefix (body[data-dsh-<id>])
 * and rewrite official anchors to semantic attributes. Strip semantics:
 *  - "body[attr]" alone               -> :root (the loader scope compound)
 *  - "body[attr] X"                   -> X (descendant of the scope)
 *  - "body[attr][data-ds-dark-theme]" -> body[data-ds-dark-theme] (the
 *    official theme attribute lives on body; keeping the body anchor makes
 *    the loader's descendant scoping match the real DOM)
 *  - "body[attr]::pseudo" / "body[attr] > X" -> body::pseudo / body > X
 */
function rewriteSelectorText(selector, bodyAttr, stats) {
  let s = selector.trim()
  const prefixRe = new RegExp('^(?:body)?\\[' + escapeRegExp(bodyAttr) + '\\]')
  const m = s.match(prefixRe)
  if (m) {
    stats.scopeStripped++
    const rest = s.slice(m[0].length)
    if (rest === '') s = ':root'
    else if (/^\s/.test(rest)) s = rest.trim()
    else s = 'body' + rest
  } else {
    stats.scopeMissed++
  }
  for (const rule of SEMANTIC_TEXT_REWRITES) {
    if (rule.re.test(s)) {
      stats.semanticRewrites++
      stats.rewriteLog.push(rule.label)
      s = s.replace(rule.re, rule.replacement)
    }
  }
  return s
}

/**
 * Walk normalized CSS and rewrite every style-rule selector list with fn.
 * Wrapper at-rules (@media etc.) are recursed into; everything else is
 * preserved verbatim.
 */
function mapStyleSelectors(css, fn) {
  function walk(items, indent) {
    const chunks = []
    for (const item of items) {
      if (item.kind === 'rule') {
        const selectors = splitSelectorList(item.prelude).map(fn)
        chunks.push(indent + selectors.join(', ') + ' {' + item.body + '}')
      } else if (item.kind === 'atrule' && WRAPPER_ATRULES.has((item.prelude.match(/^@([\w-]+)/) || [])[1] || '')) {
        chunks.push(indent + item.prelude + ' {\n' + walk(parseTopLevel(item.body), indent + '  ') + '\n' + indent + '}')
      } else if (item.kind === 'atrule') {
        chunks.push(indent + item.prelude + ' {' + item.body + '}')
      } else {
        chunks.push(indent + item.prelude + ';')
      }
    }
    return chunks.join('\n\n')
  }
  return walk(parseTopLevel(css), '') + '\n'
}

/**
 * Normalize the extracted v1 CSS: rename skin-private variables, strip scope
 * prefixes, rewrite semantic anchors, and pretty-print through lightningcss
 * (parse + print only — visitor-based selector surgery is impossible here
 * because lightningcss 1.32.0 fails to serialize rules whose declarations
 * contain var() when a style visitor returns the rule; see the skin-center
 * css-safety pipeline note in the migration report).
 * Returns stats including the normalized css text.
 */
export function normalizeStylesheet(css, { bodyAttr }) {
  const stats = { scopeStripped: 0, scopeMissed: 0, semanticRewrites: 0, rewriteLog: [] }
  stats.renamedVars = (css.match(/--dsw-skin-/g) || []).length
  const renamed = css.replace(/--dsw-skin-/g, '--dsh-skin-')
  const printed = lightningTransform({
    filename: 'skin-v1-extract.css',
    code: Buffer.from(renamed),
  }).code.toString()
  stats.css = mapStyleSelectors(printed, (sel) => rewriteSelectorText(sel, bodyAttr, stats))
  return stats
}

// --- stylesheet splitting (text level, on lightningcss-normalized output) -----

/** Parse normalized CSS into top-level items. Input must be printer output. */
function parseTopLevel(css) {
  const items = []
  let i = 0
  const n = css.length
  while (i < n) {
    while (i < n && /\s/.test(css[i])) i++
    if (i >= n) break
    if (css.startsWith('/*', i)) {
      const end = css.indexOf('*/', i + 2)
      i = end === -1 ? n : end + 2
      continue
    }
    const start = i
    let paren = 0
    let str = null
    let endKind = null
    while (i < n) {
      const ch = css[i]
      if (str) {
        if (ch === '\\') i++
        else if (ch === str) str = null
      } else if (ch === '"' || ch === "'") str = ch
      else if (css.startsWith('/*', i)) {
        const end = css.indexOf('*/', i + 2)
        i = end === -1 ? n : end + 2
        continue
      } else if (ch === '(') paren++
      else if (ch === ')') paren--
      else if (paren === 0 && (ch === '{' || ch === ';')) {
        endKind = ch
        break
      }
      i++
    }
    const prelude = css.slice(start, i).trim()
    if (endKind === ';') {
      items.push({ kind: 'statement', prelude })
      i++
      continue
    }
    if (endKind === '{') {
      let depth = 0
      const bodyStart = i + 1
      let j = i
      str = null
      while (j < n) {
        const ch = css[j]
        if (str) {
          if (ch === '\\') j++
          else if (ch === str) str = null
        } else if (ch === '"' || ch === "'") str = ch
        else if (css.startsWith('/*', j)) {
          const end = css.indexOf('*/', j + 2)
          j = end === -1 ? n : end + 2
          continue
        } else if (ch === '{') depth++
        else if (ch === '}') {
          depth--
          if (depth === 0) break
        }
        j++
      }
      items.push({ kind: prelude.startsWith('@') ? 'atrule' : 'rule', prelude, body: css.slice(bodyStart, j) })
      i = j + 1
      continue
    }
    break
  }
  return items
}

/** Split a selector list on top-level commas (paren/bracket aware). */
function splitSelectorList(prelude) {
  const parts = []
  let depth = 0
  let str = null
  let start = 0
  for (let i = 0; i < prelude.length; i++) {
    const ch = prelude[i]
    if (str) {
      if (ch === '\\') i++
      else if (ch === str) str = null
    } else if (ch === '"' || ch === "'") str = ch
    else if (ch === '(' || ch === '[') depth++
    else if (ch === ')' || ch === ']') depth--
    else if (ch === ',' && depth === 0) {
      parts.push(prelude.slice(start, i).trim())
      start = i + 1
    }
  }
  parts.push(prelude.slice(start).trim())
  return parts.filter(Boolean)
}

const CORE_ATTRS = new Set(['data-dsh-surface', 'data-dsh-part', 'data-dsh-plugin'])
const CORE_TYPES = new Set(['html', 'body'])
const CORE_PSEUDOS = new Set([
  'root', 'hover', 'active', 'focus', 'focus-visible', 'focus-within',
  'visited', 'link', 'disabled', 'enabled', 'checked', 'empty',
  'first-child', 'last-child', 'only-child', 'first-of-type', 'last-of-type',
  'not', 'is', 'where', 'has', 'dir', 'lang',
  'nth-child', 'nth-of-type', 'nth-last-child',
  'selection', 'placeholder', 'backdrop', 'marker', 'before', 'after',
  'webkit-scrollbar', 'webkit-scrollbar-track', 'webkit-scrollbar-thumb',
  'webkit-scrollbar-corner', 'webkit-scrollbar-button', 'webkit-resizer',
])
const FUNCTIONAL_SELECTOR_PSEUDOS = new Set(['not', 'is', 'where', 'has'])


/**
 * Classify one (rewritten, normalized) selector as L1/L2-core or L3-patch.
 * Core selectors combine only html/body types, semantic attributes,
 * official data-ds-* theme attributes and a small pseudo allowlist, and
 * carry at least one anchor (:root, html/body, or an allowed attribute).
 */
export function classifySelector(selector, { needAnchor = true } = {}) {
  let rest = ' ' + selector.trim() + ' '
  let anchored = false
  const failures = []
  // Attribute selectors: names must be semantic or official theme state.
  rest = rest.replace(/\[\s*([a-zA-Z][\w-]*)[^\]]*\]/g, (m, name) => {
    if (CORE_ATTRS.has(name) || name.startsWith('data-ds-')) {
      anchored = true
      return '  '
    }
    failures.push('attribute [' + name + ']')
    return '  '
  })
  // Functional pseudo-classes, innermost first; :not/:is/:where/:has carry
  // nested selector lists that must classify core as well (without anchor).
  let prev = null
  while (prev !== rest) {
    prev = rest
    rest = rest.replace(/::?(-?[a-zA-Z][\w-]*)\(([^()]*)\)/g, (m, name, args) => {
      const base = name.toLowerCase()
      if (!CORE_PSEUDOS.has(base)) {
        failures.push('pseudo :' + base + '()')
        return '  '
      }
      if (FUNCTIONAL_SELECTOR_PSEUDOS.has(base)) {
        for (const inner of splitSelectorList(args)) {
          const res = classifySelector(inner, { needAnchor: false })
          if (!res.core) failures.push(':' + base + '(' + inner + ' -> ' + res.reason + ')')
        }
      }
      return '  '
    })
  }
  // Remaining pseudo-classes/elements (vendor prefixes normalize away).
  rest = rest.replace(/::?(-?[a-zA-Z][\w-]*)/g, (m, name) => {
    const base = name.toLowerCase().replace(/^-/, '')
    if (!CORE_PSEUDOS.has(base)) {
      failures.push('pseudo :' + base)
      return '  '
    }
    if (base === 'root') anchored = true
    return '  '
  })
  if (/[.#&]/.test(rest)) failures.push('class/id selector')
  const types = rest.match(/[a-zA-Z][\w-]*/g) || []
  for (const t of types) {
    if (!CORE_TYPES.has(t.toLowerCase())) failures.push('element <' + t + '>')
    else anchored = true
  }
  if (failures.length > 0) return { core: false, reason: failures[0] }
  if (needAnchor && !anchored) return { core: false, reason: 'no scope anchor' }
  return { core: true }
}

function classifyRule(prelude) {
  const selectors = splitSelectorList(prelude)
  const reasons = []
  for (const sel of selectors) {
    const res = classifySelector(sel)
    if (!res.core) reasons.push(sel + ' (' + res.reason + ')')
  }
  return { core: reasons.length === 0, reasons }
}

const WRAPPER_ATRULES = new Set(['media', 'supports', 'layer', 'container', 'scope', 'starting-style'])

/**
 * Split a normalized stylesheet into core (skin.css) and patch (patches.css)
 * texts. Returns { core, patches, stats }.
 */
export function splitStylesheet(css) {
  const stats = { coreRules: 0, patchRules: 0, patchReasons: [], keyframesDropped: [], notes: [] }

  function render(items, bucket, indent) {
    const chunks = []
    for (const item of items) {
      if (item.kind === 'rule') {
        const cls = classifyRule(item.prelude)
        const mine = (bucket === 'core') === cls.core
        if (!cls.core) {
          if (bucket === 'patches') {
            stats.patchRules++
            for (const r of cls.reasons) stats.patchReasons.push(r)
          }
        } else if (bucket === 'core') {
          stats.coreRules++
        }
        if (mine) chunks.push(indent + item.prelude + ' {' + item.body + '}')
      } else if (item.kind === 'atrule') {
        const name = (item.prelude.match(/^@([\w-]+)/) || [])[1] || ''
        if (WRAPPER_ATRULES.has(name)) {
          const inner = render(parseTopLevel(item.body), bucket, indent + '  ')
          if (inner.trim().length > 0) chunks.push(indent + item.prelude + ' {\n' + inner + '\n' + indent + '}')
        } else if (name === 'keyframes' || name.endsWith('keyframes')) {
          continue // re-attached below, only where referenced
        } else if (name === 'font-face' || name === 'page' || name === 'property') {
          if (bucket === 'core') chunks.push(indent + item.prelude + ' {' + item.body + '}')
        } else {
          // Unknown block at-rule: keep it out of skin.css, disclose as patch.
          if (bucket === 'patches') {
            stats.notes.push('unknown at-rule @' + name + ' routed to patches.css')
            chunks.push(indent + item.prelude + ' {' + item.body + '}')
          }
        }
      } else if (item.kind === 'statement') {
        // e.g. @charset / @import; keep in skin.css so the safety pipeline
        // sees it (@import fails closed there, which is the intended signal).
        if (bucket === 'core') chunks.push(indent + item.prelude + ';')
      }
    }
    return chunks.join('\n\n')
  }

  const items = parseTopLevel(css)
  const keyframes = items.filter((it) => it.kind === 'atrule' && /keyframes/.test(it.prelude))
  let core = render(items, 'core', '')
  let patches = render(items, 'patches', '')

  for (const kf of keyframes) {
    const name = (kf.prelude.match(/keyframes\s+([\w-]+)/) || [])[1]
    if (!name) continue
    const useRe = new RegExp('(^|[^\\w-])' + escapeRegExp(name) + '([^\\w-]|$)')
    if (useRe.test(core)) core += '\n\n' + kf.prelude + ' {' + kf.body + '}'
    else if (useRe.test(patches)) patches += '\n\n' + kf.prelude + ' {' + kf.body + '}'
    else stats.keyframesDropped.push(name)
  }
  return { core, patches, stats }
}

/**
 * Delete skin-private custom property definitions with zero consumers
 * (--dsh-skin-* after the rename, --dsw-static-* color scales): a definition
 * that no var() in either output file references is dead weight (the matrix
 * static color-scale case). Returns the removed names.
 */
function dropDeadPrivateVars(files) {
  const removed = []
  for (const key of ['core', 'patches']) {
    const defs = [...files[key].matchAll(/^[ \t]*(--(?:dsh-skin|dsw-static)-[\w-]+)\s*:/gm)]
    for (const d of defs) {
      const name = d[1]
      const useRe = new RegExp('var\\(\\s*' + escapeRegExp(name) + '(?=[,\\s)])')
      if (useRe.test(files.core + '\n' + files.patches)) continue
      const lineRe = new RegExp('^[ \\t]*' + escapeRegExp(name) + '\\s*:[^\\n]*\\n?', 'm')
      files[key] = files[key].replace(lineRe, '')
      if (!removed.includes(name)) removed.push(name)
    }
  }
  // Rules left empty by the cleanup are noise; drop them.
  for (const key of ['core', 'patches']) {
    let prev = null
    while (prev !== files[key]) {
      prev = files[key]
      files[key] = files[key].replace(/\n?[ \t]*[^{}\n][^{}]*?\{\s*\}/g, '')
    }
    files[key] = (files[key].replace(/\n{3,}/g, '\n\n').trim() + '\n').replace(/^\n+/, '')
  }
  return removed
}

// --- manifest -----------------------------------------------------------------

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/
const V1_DEPRECATED = ['package', 'wiring', 'bodyAttr']
const V1_PASSTHROUGH = ['id', 'name', 'nameEn', 'author', 'tagline', 'description', 'tags', 'accent', 'order']
const V1_LEGAL = ['license', 'licenseUrl', 'noticeUrl', 'sourceUrl', 'attribution']

/** Build the v2 manifest from the v1 skin.json plus the extraction results. */
export function buildManifestV2(v1, { version, backgroundMedia, hasPatches, hasHooks }) {
  const manifest = {
    $schema: 'https://schemas.linxin666.org/dsh-skin/v2.json',
    skinManifestVersion: 2,
  }
  for (const key of V1_PASSTHROUGH) {
    if (v1[key] !== undefined) manifest[key] = v1[key]
  }
  manifest.version = version
  for (const key of V1_LEGAL) {
    if (v1[key] !== undefined) manifest[key] = v1[key]
  }
  if (v1.preview && typeof v1.preview === 'object') {
    manifest.preview = {}
    for (const theme of ['light', 'dark']) {
      manifest.preview[theme] = 'preview/' + basename(v1.preview[theme] || theme + '.png')
    }
  }
  if (hasHooks) {
    manifest.requires = {
      contracts: [{ apiVersion: HOOKS_API_VERSION, kind: 'SkinHooks', optional: true }],
    }
  }
  manifest.contributes = { stylesheet: 'skin.css' }
  if (hasPatches) manifest.contributes.patches = 'patches.css'
  if (backgroundMedia) manifest.contributes.backgroundMedia = backgroundMedia
  if (hasHooks) {
    manifest.facets = { client: { entry: 'hooks.mjs', apiVersion: HOOKS_API_VERSION } }
  }
  return manifest
}

/** Resolve a v1 file path (repo-root-relative in v1 manifests) to disk. */
function resolveV1Path(v1Path, skinDir, skinId) {
  const candidates = [join(REPO_ROOT, v1Path), join(skinDir, v1Path)]
  const marker = '/skins/' + skinId + '/'
  const at = v1Path.indexOf(marker)
  if (at !== -1) candidates.push(join(skinDir, v1Path.slice(at + marker.length)))
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

// --- hooks draft ----------------------------------------------------------------

/**
 * Draft hooks.mjs for the effects that cannot be migrated statically.
 * favicon: { file } when a favicon asset was extracted.
 */
function draftHooks({ skinId, name, favicon, backdropMigrated, todos }) {
  const lines = []
  lines.push('/**')
  lines.push(' * ' + name + ' (' + skinId + ') skin hooks - DRAFT generated by scripts/dsh-skin-migrate-v2.mjs.')
  lines.push(' *')
  lines.push(' * TODO: manual review required before this file ships (issue #506). This')
  lines.push(' * is a scaffold, not a verified port: read every TODO below, test against')
  lines.push(' * the skin-center hooks runtime (contract ' + HOOKS_API_VERSION + '),')
  lines.push(' * then delete this header comment.')
  lines.push(' *')
  lines.push(' * Auto-migrated by the codemod (no hook code needed):')
  if (backdropMigrated) {
    lines.push(' *  - backdrop artwork + light/dark readability scrims ->')
    lines.push(' *    contributes.backgroundMedia in skin.json. The skin-center owns the')
    lines.push(' *    theme switch and the background-occlusion control now; the v1')
    lines.push(' *    MutationObserver scrim swap is intentionally dropped.')
  }
  lines.push(' *  - stylesheet scoping -> html[data-dsh-skin="' + skinId + '"] (loader-owned);')
  lines.push(' *    the v1 body attribute is never written by v2 skins.')
  lines.push(' *')
  lines.push(' * TODO manual port:')
  let n = 0
  if (favicon) {
    n++
    lines.push(' *  ' + n + '. favicon injection - drafted below from the v1 bundle constant;')
    lines.push(' *     verify the asset URL base (ctx.assetBase) and the replace/restore')
    lines.push(' *     semantics against any pre-existing favicon link.')
  }
  for (const todo of todos) {
    n++
    lines.push(' *  ' + n + '. ' + todo)
  }
  if (n === 0) lines.push(' *  (none detected - verify by comparing with the v1 apply())')
  lines.push(' */')
  lines.push('')
  lines.push('export default function defineSkinHooks() {')
  lines.push('  return {')
  lines.push('    apply(ctx) {')
  if (favicon) {
    lines.push('      // TODO(review): favicon port. v1 injected a <link rel="icon"> with an')
    lines.push('      // inline SVG; the codemod extracted it to ' + favicon.file + '.')
    lines.push("      const favicon = document.createElement('link')")
    lines.push("      favicon.rel = 'icon'")
    lines.push("      favicon.type = 'image/svg+xml'")
    lines.push("      favicon.href = ctx.assetBase + '/" + favicon.file + "'")
    lines.push('      document.head.append(favicon)')
    lines.push('      ctx.onCleanup(() => favicon.remove())')
  } else {
    lines.push('      // TODO(review): port the v1 effects listed in the header.')
    lines.push('      void ctx')
  }
  lines.push('    },')
  lines.push('  }')
  lines.push('}')
  lines.push('')
  return lines.join('\n')
}

// --- orchestration --------------------------------------------------------------

/**
 * Migrate one v1 skin directory. Options:
 *   skinDir  - absolute path of packages/skins/<id>
 *   outDir   - absolute output directory (required when write:true)
 *   write    - false = check mode (nothing touches disk)
 * Returns a structured report; report.ok is the pass/fail verdict.
 */
export async function migrateSkin({ skinDir, outDir = null, write = false, force = false }) {
  const report = {
    skinDir,
    outDir,
    write,
    ok: false,
    errors: [],
    warnings: [],
    skinId: null,
    droppedFields: [],
    version: null,
    css: {},
    assets: [],
    backgroundMedia: false,
    hooks: null,
    validation: {},
    outputs: [],
    manifest: null,
    skinCss: null,
    patchesCss: null,
    hooksSource: null,
  }
  const fail = (msg) => {
    report.errors.push(msg)
    return report
  }

  const skinJsonPath = join(skinDir, 'skin.json')
  const bundlePath = join(skinDir, 'lib', 'client.js')
  if (!existsSync(skinJsonPath)) return fail('skin.json not found in ' + skinDir)
  if (!existsSync(bundlePath)) return fail('lib/client.js not found in ' + skinDir + ' (run the v1 build first)')

  const v1 = JSON.parse(readFileSync(skinJsonPath, 'utf8'))
  const bundleText = readFileSync(bundlePath, 'utf8')
  report.skinId = v1.id
  if (typeof v1.id !== 'string' || !/^[a-z][a-z0-9-]{0,31}$/.test(v1.id)) {
    return fail('skin.json id is missing or invalid: ' + JSON.stringify(v1.id))
  }
  const bodyAttr = v1.bodyAttr || 'data-dsh-' + v1.id
  if (!v1.bodyAttr) report.warnings.push('skin.json has no bodyAttr; assumed ' + bodyAttr)
  for (const key of V1_DEPRECATED) {
    if (v1[key] !== undefined) report.droppedFields.push(key)
  }

  // Version: keep the v1 package version for lineage, else start at 1.0.0.
  let version = '1.0.0'
  const pkgPath = join(skinDir, 'package.json')
  if (existsSync(pkgPath)) {
    const pkgVersion = JSON.parse(readFileSync(pkgPath, 'utf8')).version
    if (typeof pkgVersion === 'string' && SEMVER.test(pkgVersion)) version = pkgVersion
  }
  report.version = version

  // --- CSS pipeline ---
  const { payloads, origin } = extractCssPayloads(bundleText, skinDir)
  if (payloads.length === 0) return fail('no CSS payload found (no dsh-css region in the bundle, no src CSS module)')
  const extracted = payloads.map((p) => p.css).join('\n')
  const norm = normalizeStylesheet(extracted, { bodyAttr })
  const split = splitStylesheet(norm.css)
  const files = { core: split.core, patches: split.patches }
  const deadVars = dropDeadPrivateVars(files)
  report.css = {
    origin,
    payloads: payloads.map((p) => p.source),
    scopeStripped: norm.scopeStripped,
    scopeMissed: norm.scopeMissed,
    renamedVarRefs: norm.renamedVars,
    semanticRewrites: norm.semanticRewrites,
    rewriteLog: norm.rewriteLog,
    coreRules: split.stats.coreRules,
    patchRules: split.stats.patchRules,
    patchReasons: split.stats.patchReasons,
    keyframesDropped: split.stats.keyframesDropped,
    notes: split.stats.notes,
    deadVarsRemoved: deadVars,
  }
  if (norm.scopeMissed > 0) {
    report.warnings.push(norm.scopeMissed + ' selector(s) carried no ' + bodyAttr + ' scope prefix; kept as-is')
  }
  if (files.core.trim().length === 0) return fail('no core rules survived the split; skin.css would be empty')

  // --- assets ---
  const images = extractImageConstants(bundleText)
  const scrims = extractScrims(bundleText)
  const art = images.filter((img) => img.mime !== 'svg+xml').sort((a, b) => b.bytes.length - a.bytes.length)[0] || null
  const favicon = images.find((img) => /ICON|FAVICON/.test(img.name)) || null
  let backgroundMedia = null
  if (art && scrims.light && scrims.dark) {
    backgroundMedia = {
      light: { type: 'image', src: art.file, scrim: scrims.light },
      dark: { type: 'image', src: art.file, scrim: scrims.dark },
    }
    report.backgroundMedia = true
  } else if (art) {
    report.warnings.push('backdrop art found (' + art.name + ') but SCRIM_LIGHT/SCRIM_DARK not recognized; backgroundMedia not generated')
  }
  // Only ship extracted images the migration actually wires up: the backdrop
  // art (backgroundMedia) and the favicon (hooks draft). Any other inlined
  // image constant is referenced from JS-built CSS we cannot rewrite
  // statically; those stay in the hooks TODO list.
  const shippedImages = []
  if (backgroundMedia && art) shippedImages.push(art)
  if (favicon) shippedImages.push(favicon)
  const unwired = images.filter((img) => !shippedImages.includes(img))
  for (const img of shippedImages) report.assets.push({ file: img.file, bytes: img.bytes.length, from: img.name })

  // --- hooks ---
  const effectTodos = detectJsEffectTodos(bundleText, {
    backdropMigrated: report.backgroundMedia,
    faviconFound: Boolean(favicon),
  })
  if (unwired.length > 0) {
    effectTodos.push('inlined image constant(s) ' + unwired.map((i) => i.name).join(', ') + ' are referenced from JS-built CSS; extract them to assets/ and rewrite the URLs by hand')
  }
  const hasHooks = Boolean(favicon) || effectTodos.length > 0
  if (hasHooks) {
    report.hooks = { favicon: favicon ? favicon.file : null, todos: effectTodos }
  }

  // --- manifest ---
  const manifest = buildManifestV2(v1, {
    version,
    backgroundMedia,
    hasPatches: files.patches.trim().length > 0,
    hasHooks,
  })
  report.manifest = manifest
  report.skinCss = files.core
  report.patchesCss = manifest.contributes.patches ? files.patches : null

  // --- validation (also the --check verdict) ---
  const validateSkinManifestV2 = await loadManifestValidator()
  const manifestResult = validateSkinManifestV2(manifest)
  report.validation.manifest = {
    ok: manifestResult.ok,
    errors: manifestResult.errors,
    warnings: manifestResult.warnings,
  }
  if (!manifestResult.ok) {
    for (const e of manifestResult.errors) report.errors.push('manifest: ' + e)
  }
  const skinCssResult = await runSkinCssSafety(files.core, { skinId: v1.id, filename: 'skin.css' })
  report.validation.skinCss = skinCssResult
  if (!skinCssResult.ok) {
    report.errors.push(skinCssResult.crash
      ? 'transformSkinCss crashed on skin.css (skin-center pipeline error, not a product defect): ' + skinCssResult.error
      : 'skin.css violates the CSS whitelist (see validation.skinCss)')
  }
  if (manifest.contributes.patches) {
    const patchResult = await runSkinCssSafety(files.patches, { skinId: v1.id, filename: 'patches.css' })
    report.validation.patchesCss = patchResult
    if (!patchResult.ok) {
      report.errors.push(patchResult.crash
        ? 'transformSkinCss crashed on patches.css (skin-center pipeline error, not a product defect): ' + patchResult.error
        : 'patches.css violates the CSS whitelist (see validation.patchesCss)')
    }
  }
  // preview files must exist to be copied.
  const previewCopies = []
  if (v1.preview) {
    for (const theme of ['light', 'dark']) {
      const src = v1.preview[theme] ? resolveV1Path(v1.preview[theme], skinDir, v1.id) : null
      if (!src) {
        report.warnings.push('preview.' + theme + ' source not found: ' + JSON.stringify(v1.preview[theme]))
      } else {
        previewCopies.push({ from: src, to: 'preview/' + basename(src) })
      }
    }
  }
  // An existing assets/ directory rides along verbatim; the v1 skin may
  // reference those files from CSS or JS (e.g. maid-atelier).
  const assetCopies = []
  const assetsDir = join(skinDir, 'assets')
  if (existsSync(assetsDir)) {
    for (const entry of readdirSync(assetsDir, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile()) continue
      const from = join(entry.parentPath, entry.name)
      assetCopies.push({ from, to: 'assets/' + relative(assetsDir, from) })
    }
  }
  // Legal files ride along when the manifest carries legal metadata.
  const legalCopies = []
  for (const f of ['LICENSE', 'NOTICE']) {
    const p = join(skinDir, f)
    if (existsSync(p) && V1_LEGAL.some((k) => v1[k] !== undefined)) legalCopies.push({ from: p, to: f })
  }

  if (report.errors.length > 0 && !(write && force)) return report
  report.ok = report.errors.length === 0

  // --- hooks source (kept on the report for tests and for write mode) ---
  if (hasHooks) {
    report.hooksSource = draftHooks({
      skinId: v1.id,
      name: v1.nameEn || v1.id,
      favicon,
      backdropMigrated: report.backgroundMedia,
      todos: effectTodos,
    })
  }

  // --- write ---
  report.outputs = ['skin.json', 'skin.css']
  if (manifest.contributes.patches) report.outputs.push('patches.css')
  if (hasHooks) report.outputs.push('hooks.mjs')
  for (const img of shippedImages) report.outputs.push(img.file)
  for (const c of assetCopies) {
    if (!report.outputs.includes(c.to)) report.outputs.push(c.to)
  }
  for (const c of previewCopies) report.outputs.push(c.to)
  for (const c of legalCopies) report.outputs.push(c.to)

  if (write) {
    if (!outDir) {
      report.ok = false
      return fail('write mode requires an output directory')
    }
    mkdirSync(outDir, { recursive: true })
    writeFileSync(join(outDir, 'skin.json'), JSON.stringify(manifest, null, 2) + '\n')
    writeFileSync(join(outDir, 'skin.css'), files.core)
    if (manifest.contributes.patches) writeFileSync(join(outDir, 'patches.css'), files.patches)
    if (report.hooksSource) writeFileSync(join(outDir, 'hooks.mjs'), report.hooksSource)
    for (const img of shippedImages) {
      mkdirSync(dirname(join(outDir, img.file)), { recursive: true })
      writeFileSync(join(outDir, img.file), img.bytes)
    }
    for (const c of assetCopies) {
      const dest = join(outDir, c.to)
      if (!existsSync(dest)) {
        mkdirSync(dirname(dest), { recursive: true })
        cpSync(c.from, dest)
      }
    }
    for (const c of previewCopies) {
      mkdirSync(dirname(join(outDir, c.to)), { recursive: true })
      cpSync(c.from, join(outDir, c.to))
    }
    for (const c of legalCopies) cpSync(c.from, join(outDir, c.to))
  }
  return report
}

// --- CLI ------------------------------------------------------------------------

function printReport(report) {
  const lines = []
  const id = report.skinId || '(unknown)'
  lines.push('dsh-skin-migrate-v2: ' + id)
  lines.push('  source: ' + report.skinDir)
  lines.push('  mode: ' + (report.write ? 'write -> ' + report.outDir : 'check (no files written)') + (report.write && !report.ok ? ' [FORCED DRAFT - validation failed]' : ''))
  if (report.droppedFields.length > 0) lines.push('  dropped v1 fields: ' + report.droppedFields.join(', '))
  if (report.version) lines.push('  version: ' + report.version + ' (from v1 package.json)')
  if (report.css && report.css.origin) {
    const c = report.css
    lines.push('  css: ' + c.payloads.length + ' payload(s) from ' + c.origin + ' [' + c.payloads.join(', ') + ']')
    lines.push('    scope prefixes stripped: ' + c.scopeStripped + (c.scopeMissed ? ' (' + c.scopeMissed + ' unscoped kept)' : ''))
    lines.push('    semantic attr rewrites: ' + c.semanticRewrites)
    lines.push('    --dsw-skin-* references renamed: ' + c.renamedVarRefs)
    lines.push('    skin.css: ' + c.coreRules + ' rule(s); patches.css: ' + c.patchRules + ' rule(s)')
    if (c.deadVarsRemoved.length > 0) lines.push('    dead private vars removed: ' + c.deadVarsRemoved.join(', '))
    if (c.keyframesDropped.length > 0) lines.push('    unreferenced keyframes dropped: ' + c.keyframesDropped.join(', '))
    for (const note of c.notes) lines.push('    note: ' + note)
  }
  for (const a of report.assets) lines.push('  asset: ' + a.file + ' (' + a.bytes + ' bytes, from ' + a.from + ')')
  lines.push('  backgroundMedia: ' + (report.backgroundMedia ? 'yes (art + light/dark scrims)' : 'no'))
  if (report.hooks) {
    lines.push('  hooks.mjs: drafted' + (report.hooks.favicon ? ' (favicon: ' + report.hooks.favicon + ')' : ''))
    for (const t of report.hooks.todos) lines.push('    TODO: ' + t)
  } else {
    lines.push('  hooks.mjs: not needed')
  }
  const v = report.validation
  if (v.manifest) lines.push('  validateSkinManifestV2: ' + (v.manifest.ok ? 'ok' : 'FAILED'))
  const cssLine = (label, r) => {
    if (!r) return
    const state = r.ok ? 'ok' : r.crash ? 'CRASH (skin-center pipeline error, not a product defect)' : 'FAILED (whitelist violation)'
    lines.push('  transformSkinCss(' + label + '): ' + state + (r.warnings && r.warnings.length ? ' (' + r.warnings.length + ' warning(s))' : ''))
  }
  cssLine('skin.css', v.skinCss)
  cssLine('patches.css', v.patchesCss)
  for (const w of report.warnings) lines.push('  warning: ' + w)
  for (const e of report.errors) lines.push('  ERROR: ' + e)
  if (report.ok || report.write) lines.push('  outputs: ' + report.outputs.join(', '))
  lines.push('  result: ' + (report.ok ? 'PASS' : 'FAIL'))
  return lines.join('\n')
}

async function main(argv) {
  const args = argv.slice(2)
  if (args.includes('--help') || args.length === 0) {
    console.log('Usage: node scripts/dsh-skin-migrate-v2.mjs <skinDir> [--out <outDir> | --check]')
    console.log('  --check   validate only, write nothing, exit 1 on failure')
    console.log('  --out     output directory for the v2 asset directory (write mode)')
    console.log('  --force   write a review draft even when validation fails (still reported)')
    return 0
  }
  const check = args.includes('--check')
  const force = args.includes('--force')
  const outIdx = args.indexOf('--out')
  const positional = args.filter((a, i) => !a.startsWith('--') && (i === 0 || args[i - 1] !== '--out'))
  const skinDir = resolvePath(positional[0])
  const outDir = outIdx !== -1 ? resolvePath(args[outIdx + 1]) : null
  if (!check && !outDir) {
    console.error('error: pass --out <dir> to write, or --check to validate only')
    return 2
  }
  const report = await migrateSkin({ skinDir, outDir, write: !check, force })
  console.log(printReport(report))
  return report.ok ? 0 : 1
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolvePath(process.argv[1])).href
if (isMain) {
  main(process.argv).then((code) => process.exit(code)).catch((err) => {
    console.error(err)
    process.exit(2)
  })
}
