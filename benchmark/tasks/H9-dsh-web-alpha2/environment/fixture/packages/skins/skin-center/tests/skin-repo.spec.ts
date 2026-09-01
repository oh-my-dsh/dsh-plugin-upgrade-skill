/**
 * Skin repository tests: dual-source discovery, fail-closed validation,
 * user-shadows-builtin, immutable snapshots, path containment.
 */

import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { findSkin, loadSkinCatalog, repairSkin, resolveInsideSkin, shippedSkinIds, uninstallUserSkin, userSkinsDir, verifyAllSkinsIntegrity, verifyAndRepairAllSkins } from '../src/skin-repo.ts'
import type { SkinCatalogEntry } from '../src/skin-repo.ts'

let root: string
let builtin: string
let user: string

function writeSkin(baseDir: string, id: string, manifest: Record<string, unknown>): void {
  const dir = join(baseDir, id)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'skin.json'), JSON.stringify(manifest, null, 2))
}

function v2(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    skinManifestVersion: 2,
    id,
    name: id,
    nameEn: id,
    version: '1.0.0',
    author: 'tester',
    contributes: { stylesheet: 'skin.css' },
    ...extra,
  }
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'skin-repo-'))
  builtin = join(root, 'builtin')
  user = join(root, 'user')
  mkdirSync(builtin)
  mkdirSync(user)
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('shippedSkinIds', () => {
  function fixturePackage(files: string[]): string {
    const pkgRoot = join(root, 'pkg-' + files.length)
    mkdirSync(join(pkgRoot, 'lib'), { recursive: true })
    writeFileSync(join(pkgRoot, 'package.json'), JSON.stringify({ files }))
    return pathToFileURL(join(pkgRoot, 'lib', 'x.js')).href
  }

  it('derives shipped ids from the package.json files whitelist', () => {
    const ids = shippedSkinIds(fixturePackage(['lib', 'skins/blue-fantasy', 'skins/whale-song/README.md', 'README.md']))
    expect([...ids].sort()).toEqual(['blue-fantasy', 'whale-song'])
  })

  it('returns an empty set without a skins whitelist entry', () => {
    expect(shippedSkinIds(fixturePackage(['lib', 'README.md'])).size).toBe(0)
  })

  it('returns an empty set when the package.json cannot be read', () => {
    const missing = join(root, 'missing', 'lib', 'x.js')
    expect(shippedSkinIds(pathToFileURL(missing).href).size).toBe(0)
  })
})

describe('loadSkinCatalog', () => {
  it('collects valid skins from both sources, sorted by order then id', () => {
    writeSkin(builtin, 'harbor', v2('harbor', { order: 3 }))
    writeSkin(builtin, 'xp', v2('xp', { order: 1 }))
    writeSkin(user, 'custom', v2('custom'))
    const catalog = loadSkinCatalog({ builtinDir: builtin, userDir: user, now: () => 42 })
    expect(catalog.skins.map((s) => s.manifest.id)).toEqual(['xp', 'harbor', 'custom'])
    expect(catalog.skins.find((s) => s.manifest.id === 'custom')?.origin).toBe('user')
    expect(catalog.capturedAt).toBe(42)
    expect(catalog.diagnostics).toEqual([])
  })

  it('excludes invalid skins fail-closed with diagnostics', () => {
    writeSkin(builtin, 'good', v2('good'))
    writeSkin(builtin, 'bad-json', {})
    writeFileSync(join(builtin, 'bad-json', 'skin.json'), '{nope')
    writeSkin(builtin, 'bad-schema', { hello: 'world' })
    writeSkin(builtin, 'bad-id', v2('different-id'))
    const catalog = loadSkinCatalog({ builtinDir: builtin, userDir: user })
    expect(catalog.skins.map((s) => s.manifest.id)).toEqual(['good'])
    const subjects = catalog.diagnostics.map((d) => d.subject).sort()
    expect(subjects).toEqual(['bad-id', 'bad-json', 'bad-schema'])
  })

  it('lets a user skin shadow the built-in one', () => {
    writeSkin(builtin, 'harbor', v2('harbor', { version: '1.0.0' }))
    writeSkin(user, 'harbor', v2('harbor', { version: '2.0.0' }))
    const catalog = loadSkinCatalog({ builtinDir: builtin, userDir: user })
    const entries = catalog.skins.filter((s) => s.manifest.id === 'harbor')
    expect(entries).toHaveLength(1)
    expect(entries[0].origin).toBe('user')
    expect(entries[0].manifest.version).toBe('2.0.0')
    expect(entries[0].warnings.join(' ')).toContain('shadows')
  })

  it('carries deprecated-field warnings without failing the skin', () => {
    writeSkin(builtin, 'legacy', v2('legacy', { package: '@linxin666/old', bodyAttr: 'data-dsh-x' }))
    const catalog = loadSkinCatalog({ builtinDir: builtin, userDir: user })
    expect(catalog.skins).toHaveLength(1)
    expect(catalog.skins[0].warnings).toHaveLength(2)
  })

  describe('market hooks provenance (issue #1073)', () => {
    const HOOKS = 'export default function defineSkinHooks() { return { apply() {} } }'

    function writeMarketSkin(id: string, provenance: Record<string, unknown> | null): string {
      const dir = join(user, id)
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'skin.json'), JSON.stringify(v2(id, {
        facets: { client: { entry: 'hooks.mjs', apiVersion: 'x-org.linxin666.skin-center/v1alpha1' } },
      }), null, 2))
      writeFileSync(join(dir, 'skin.css'), '.a { color: red; }')
      writeFileSync(join(dir, 'hooks.mjs'), HOOKS)
      if (provenance !== null) {
        writeFileSync(join(dir, 'dsh-market.provenance.json'), JSON.stringify(provenance, null, 2))
      }
      return dir
    }

    function provenanceFor(dir: string, id: string, rels: string[]): Record<string, unknown> {
      const files: Record<string, string> = {}
      for (const rel of rels) {
        files[rel] = createHash('sha256').update(readFileSync(join(dir, rel))).digest('hex')
      }
      return { version: 1, source: 'https://dsh-market.com', kind: 'skin', id, installedAt: new Date().toISOString(), files }
    }

    it('trusts hooks when skin.json and hooks hash-match market provenance', () => {
      const dir = writeMarketSkin('matrix', null)
      writeFileSync(join(dir, 'dsh-market.provenance.json'), JSON.stringify(provenanceFor(dir, 'matrix', ['skin.json', 'hooks.mjs', 'skin.css'])))
      const catalog = loadSkinCatalog({ builtinDir: builtin, userDir: user })
      const entry = catalog.skins.find((s) => s.manifest.id === 'matrix')
      expect(entry?.hooksTrusted).toBe(true)
      expect(entry?.warnings.join(' ')).not.toContain('refused')
    })

    it('recovers a legacy Workshop install only when reviewed manifest and hooks bytes match', () => {
      const reviewed = join(import.meta.dirname, '..', 'skins', 'matrix')
      const dir = join(user, 'matrix')
      mkdirSync(dir, { recursive: true })
      for (const rel of ['skin.json', 'skin.css', 'hooks.mjs']) {
        writeFileSync(join(dir, rel), readFileSync(join(reviewed, rel)))
      }
      // Declarative files that are outside the executable identity may differ;
      // recovery trusts only the complete manifest plus declared hook bytes.
      writeFileSync(join(dir, 'skin.css'), '.customized { color: lime; }')

      const catalog = loadSkinCatalog({ builtinDir: builtin, userDir: user })
      const entry = catalog.skins.find((skin) => skin.manifest.id === 'matrix')
      expect(entry?.origin).toBe('user')
      expect(entry?.hooksTrusted).toBe(true)
      expect(entry?.warnings.join(' ')).not.toContain('refused')
      expect(() => readFileSync(join(dir, 'dsh-market.provenance.json'))).toThrow()
    })

    it('keeps a legacy Workshop-shaped skin refused after manifest or hooks tampering', () => {
      const reviewed = join(import.meta.dirname, '..', 'skins', 'matrix')
      for (const id of ['matrix', 'matrix-copy']) {
        const dir = join(user, id)
        mkdirSync(dir, { recursive: true })
        writeFileSync(join(dir, 'skin.css'), readFileSync(join(reviewed, 'skin.css')))
        writeFileSync(join(dir, 'hooks.mjs'), readFileSync(join(reviewed, 'hooks.mjs')))
        const manifest = JSON.parse(readFileSync(join(reviewed, 'skin.json'), 'utf8'))
        manifest.id = id
        writeFileSync(join(dir, 'skin.json'), JSON.stringify(manifest, null, 2))
      }
      writeFileSync(join(user, 'matrix', 'hooks.mjs'), 'export default () => ({ apply() {} }) // tampered')

      const catalog = loadSkinCatalog({ builtinDir: builtin, userDir: user })
      for (const id of ['matrix', 'matrix-copy']) {
        const entry = catalog.skins.find((skin) => skin.manifest.id === id)
        expect(entry?.hooksTrusted).toBeUndefined()
        expect(entry?.warnings.join(' ')).toContain('hooks facet will be refused')
      }
    })

    it('refuses hooks without provenance or after tampering', () => {
      // no provenance at all
      writeMarketSkin('noprovenance', null)
      // provenance, then the hooks bytes were replaced afterwards
      const tampered = writeMarketSkin('tampered', null)
      writeFileSync(join(tampered, 'dsh-market.provenance.json'), JSON.stringify(provenanceFor(tampered, 'tampered', ['skin.json', 'hooks.mjs'])))
      writeFileSync(join(tampered, 'hooks.mjs'), 'export default () => ({ apply() { return 1 } }) // tampered')
      // provenance from a foreign source
      const foreign = writeMarketSkin('foreign', null)
      const prov = provenanceFor(foreign, 'foreign', ['skin.json', 'hooks.mjs']) as { source: string }
      prov.source = 'https://example.com'
      writeFileSync(join(foreign, 'dsh-market.provenance.json'), JSON.stringify(prov))
      const catalog = loadSkinCatalog({ builtinDir: builtin, userDir: user })
      for (const id of ['noprovenance', 'tampered', 'foreign']) {
        const entry = catalog.skins.find((s) => s.manifest.id === id)
        expect(entry?.hooksTrusted).toBeUndefined()
        expect(entry?.warnings.join(' ')).toContain('hooks facet will be refused')
      }
    })

    it('pins the facet entry path through the skin.json hash', () => {
      const dir = writeMarketSkin('repinned', null)
      writeFileSync(join(dir, 'dsh-market.provenance.json'), JSON.stringify(provenanceFor(dir, 'repinned', ['skin.json', 'hooks.mjs'])))
      // post-install manifest rewrite pointing the facet at another file
      writeFileSync(join(dir, 'skin.json'), JSON.stringify(v2('repinned', {
        facets: { client: { entry: 'other.mjs', apiVersion: 'x-org.linxin666.skin-center/v1alpha1' } },
      }), null, 2))
      writeFileSync(join(dir, 'other.mjs'), HOOKS)
      const catalog = loadSkinCatalog({ builtinDir: builtin, userDir: user })
      const entry = catalog.skins.find((s) => s.manifest.id === 'repinned')
      expect(entry?.hooksTrusted).toBeUndefined()
    })
  })

  it('tolerates missing roots', () => {
    const catalog = loadSkinCatalog({ builtinDir: join(root, 'nope'), userDir: join(root, 'nada') })
    expect(catalog.skins).toEqual([])
    expect(catalog.diagnostics).toEqual([])
  })
})

describe('userSkinsDir', () => {
  it('uses DSH_SKINS_HOME, then DSH_SKINS_DIR, then DSH_HOME/skins', () => {
    expect(userSkinsDir({ DSH_SKINS_HOME: join(root, 'home'), DSH_SKINS_DIR: join(root, 'dir') })).toBe(join(root, 'home'))
    expect(userSkinsDir({ DSH_SKINS_DIR: join(root, 'dir') })).toBe(join(root, 'dir'))
    expect(userSkinsDir({ DSH_HOME: join(root, 'dsh') })).toBe(join(root, 'dsh', 'skins'))
  })
})

describe('findSkin / resolveInsideSkin', () => {
  it('finds by id and rejects escapes', () => {
    writeSkin(builtin, 'harbor', v2('harbor'))
    const catalog = loadSkinCatalog({ builtinDir: builtin, userDir: user })
    const entry = findSkin(catalog, 'harbor') as SkinCatalogEntry
    expect(entry.manifest.id).toBe('harbor')
    expect(resolveInsideSkin(entry, 'assets/bg.png')).toBe(join(entry.dir, 'assets/bg.png'))
    expect(resolveInsideSkin(entry, '../secret')).toBeNull()
    expect(resolveInsideSkin(entry, '../../etc/passwd')).toBeNull()
    expect(resolveInsideSkin(entry, 'a/../../secret')).toBeNull()
    expect(findSkin(catalog, 'nope')).toBeNull()
  })
})

describe('uninstallUserSkin', () => {
  it('uninstalls an existing user skin and clears catalog cache', () => {
    writeSkin(user, 'custom-skin', v2('custom-skin'))
    const cache = new Map()
    const cat1 = loadSkinCatalog({ builtinDir: builtin, userDir: user, catalogCache: cache })
    expect(cat1.skins.find((s) => s.manifest.id === 'custom-skin')).toBeDefined()

    const res = uninstallUserSkin('custom-skin', { userDir: user, catalogCache: cache })
    expect(res).toEqual({ ok: true })

    const cat2 = loadSkinCatalog({ builtinDir: builtin, userDir: user, catalogCache: cache })
    expect(cat2.skins.find((s) => s.manifest.id === 'custom-skin')).toBeUndefined()
  })

  it('rejects invalid or escaping ids', () => {
    expect(uninstallUserSkin('', { userDir: user })).toEqual({ ok: false, error: 'invalid-id' })
    expect(uninstallUserSkin('../escape', { userDir: user })).toEqual({ ok: false, error: 'invalid-id' })
    expect(uninstallUserSkin('invalid/path', { userDir: user })).toEqual({ ok: false, error: 'invalid-id' })
  })

  it('returns skin-not-found when directory does not exist', () => {
    expect(uninstallUserSkin('nonexistent', { userDir: user })).toEqual({ ok: false, error: 'skin-not-found' })
  })
})

describe('verifyAllSkinsIntegrity', () => {
  it('reports valid for builtins and valid user market skins', () => {
    writeSkin(builtin, 'harbor', v2('harbor'))
    const manifestText = JSON.stringify(v2('user-good'), null, 2)
    writeSkin(user, 'user-good', JSON.parse(manifestText))
    writeFileSync(join(user, 'user-good', 'skin.css'), '.good { color: green; }')
    const jsonHash = createHash('sha256').update(manifestText).digest('hex')
    const cssHash = createHash('sha256').update('.good { color: green; }').digest('hex')
    writeFileSync(join(user, 'user-good', 'dsh-market.provenance.json'), JSON.stringify({
      version: 1,
      source: 'https://dsh-market.com',
      id: 'user-good',
      files: {
        'skin.json': jsonHash,
        'skin.css': cssHash,
      },
    }))

    const catalog = loadSkinCatalog({ builtinDir: builtin, userDir: user })
    const summary = verifyAllSkinsIntegrity(catalog)
    expect(summary.total).toBe(2)
    expect(summary.valid).toBe(2)
    expect(summary.issues).toBe(0)
    expect(summary.details.every((d) => d.status === 'valid')).toBe(true)
  })

  it('detects tampered and missing files in provenance', () => {
    const manifestText = JSON.stringify(v2('tampered-skin'), null, 2)
    writeSkin(user, 'tampered-skin', JSON.parse(manifestText))
    writeFileSync(join(user, 'tampered-skin', 'skin.css'), '.tampered { color: red; }')
    writeFileSync(join(user, 'tampered-skin', 'dsh-market.provenance.json'), JSON.stringify({
      version: 1,
      source: 'https://dsh-market.com',
      id: 'tampered-skin',
      files: {
        'skin.json': '0000000000000000000000000000000000000000000000000000000000000000',
        'missing.css': '1111111111111111111111111111111111111111111111111111111111111111',
      },
    }))

    const catalog = loadSkinCatalog({ builtinDir: builtin, userDir: user })
    const summary = verifyAllSkinsIntegrity(catalog)
    expect(summary.issues).toBe(1)
    const report = summary.details.find((d) => d.id === 'tampered-skin')
    expect(report?.status).toBe('missing-files')
    expect(report?.missing).toContain('missing.css')
    expect(report?.mismatches).toContain('skin.json')
  })
})

describe('repairSkin and verifyAndRepairAllSkins', () => {
  it('automatically repairs tampered skins from local source mirror or mock fetch', async () => {
    // Write mirror source for 'my-skin'
    const mirror = join(root, 'mirror')
    const mirrorSkinDir = join(mirror, 'my-skin')
    mkdirSync(mirrorSkinDir, { recursive: true })
    const manifestContent = JSON.stringify(v2('my-skin'), null, 2)
    writeFileSync(join(mirrorSkinDir, 'skin.json'), manifestContent)
    writeFileSync(join(mirrorSkinDir, 'skin.css'), '.pristine { color: blue; }')

    // Write a corrupted user install of 'my-skin'
    writeSkin(user, 'my-skin', JSON.parse(manifestContent))
    writeFileSync(join(user, 'my-skin', 'skin.css'), '.corrupted { color: red; }')
    // Provenance with incorrect hash
    writeFileSync(join(user, 'my-skin', 'dsh-market.provenance.json'), JSON.stringify({
      version: 1,
      source: 'https://dsh-market.com',
      id: 'my-skin',
      files: {
        'skin.json': createHash('sha256').update(manifestContent).digest('hex'),
        'skin.css': createHash('sha256').update('.pristine { color: blue; }').digest('hex'),
      },
    }))

    const catalogCache = new Map()
    const getCatalog = () => loadSkinCatalog({ builtinDir: builtin, userDir: user, catalogCache })

    // Verify and auto-repair
    const summary = await verifyAndRepairAllSkins(getCatalog, {
      userDir: user,
      catalogCache,
      localSourceDir: mirrorSkinDir,
      autoRepair: true,
    })

    expect(summary.repaired).toContain('my-skin')
    expect(summary.issues).toBe(0)
    expect(summary.valid).toBe(1)

    // Check that file on disk is restored to pristine content
    const restoredCss = readFileSync(join(user, 'my-skin', 'skin.css'), 'utf8')
    expect(restoredCss).toBe('.pristine { color: blue; }')
  })

  it('handles repair failure gracefully when skin is not available', async () => {
    writeSkin(user, 'custom-offline', v2('custom-offline'))
    writeFileSync(join(user, 'custom-offline', 'dsh-market.provenance.json'), JSON.stringify({
      version: 1,
      source: 'https://dsh-market.com',
      id: 'custom-offline',
      files: { 'skin.json': '00000000' },
    }))

    const mockFetch = async () => new Response(JSON.stringify({ items: [] }), { status: 200 })

    const catalogCache = new Map()
    const getCatalog = () => loadSkinCatalog({ builtinDir: builtin, userDir: user, catalogCache })

    const summary = await verifyAndRepairAllSkins(getCatalog, {
      userDir: user,
      catalogCache,
      fetchImpl: mockFetch as any,
      localSourceDir: join(root, 'nonexistent'),
      autoRepair: true,
    })

    expect(summary.repaired).toHaveLength(0)
    expect(summary.repairFailed).toHaveLength(1)
    expect(summary.repairFailed[0].id).toBe('custom-offline')
    expect(summary.issues).toBe(1)
  })
})
