# S2 · Negative Scan Report — @demo/dsh-minimal-llm (→ dsh 0.1.2-alpha.2)

Task: read-only touchpoint scan of the fixture plugin source, per the plugin-upgrade
skill (Mode A-style inspection feeding a Mode C pre-flight). No file under the fixture
was modified; no build, install, or migration was executed (fixture is a static copy,
dsh not installed).

## 0. Identity and version corridor

| Item | Value | Evidence |
|---|---|---|
| Plugin | `@demo/dsh-minimal-llm` v0.1.0, private, ESM (`main: index.js`) | package.json:2-6 |
| Corridor `from` | dsh 0.1.1-rc.2 style (inferred) | index.js:2 comment "0.1.1-rc.2 style"; dependency `@deepseek-ai/dsh-host-apiproxy@0.0.1-rc.1` (package.json:17) matches the rc.2-era apiProxy package named in DSH-0.1.2-A1-01 identifiers note |
| Corridor `to` | dsh 0.1.2-alpha.2 | task brief |
| Corridor edges | v0.1.2-alpha.1.md (rc.2→alpha.1, 28 cards) + v0.1.2-alpha.2.md (alpha.1→alpha.2, 8 cards), plus api-migration-0.1.2-alpha.2.md ledger | references/README.md corridor index rows 2-3 |
| Install track | static copied source (registry-style package manifest, no lockfile, no node_modules) | fixture directory contents |
| Profile composition | `cordis.patch.yml` exports a `patch` composition file with one plugin insert (`minimal-llm`) | cordis.patch.yml:1-3, package.json:9-14 |

Baseline (Mode C step 0): not collected — the fixture is a non-executable static copy;
build/typecheck cannot run here. Listed instead under "Must verify".

## 1. Seven touchpoint categories — hit / no-hit with evidence

Scan method: the reference patterns from skills/plugin-upgrade/references/pre-flight.md
(and its pre-flight-patterns.json source) run as content searches over all 5 fixture
files (README.md, package.json, cordis.patch.yml, index.js, src/session-notes.js).
No directories were excluded — the fixture is tiny and fully scanned.

| Touchpoint | Hit | File/line | Evidence and classification | Applicable card | Confidence |
|---|---:|---|---|---|---|
| #1 source patch / monkey patch | No | package.json:9,13 | Only hits are the literal filename `cordis.patch.yml`, which is profile composition, not a source patch. No `patchedDependencies`, `patch-package`, `DSH_HARNESS_SOURCE_ROOT`, or monkey-patch patterns anywhere. Pre-flight explicitly says "a filename containing `patch` alone is not a hit for this class". | API-08 (classification only, no action) | High |
| #2 internal events / persistent events | No | — | No `SessionEvent`, `ctx.on(`, `subscribe(`, `tool/code-dispatch`, `connection/reset`, etc. `src/session-notes.js` looks suspicious by filename ("session") but contains only pure string/array utilities (`formatSessionNote`, `chunk`) with no host coupling — confirmed zero-hit, not just low-relevance. | none | High |
| #3 internal service probes / Remote | **YES** | index.js:3, 9 | `export const inject = ["apiProxy"]` and `await ctx.apiProxy.llm.providers()` — the rc.2-era host-plane APIProxy facade, called with the old dot-domain style. This is exactly the surface DSH-0.1.2-A1-01 removes. | **DSH-0.1.2-A1-01**, API-01 ledger, DSH-0.1.2-A2-02 | High |
| #4 direct host directory reads/writes | No | — | No `DSH_HOME`, `.dsh`, `profiles/`, `homedir()`, `readFile`/`writeFile`/`mkdir`/`openPath` hits. | none | High |
| #5 internal UI / commands / tool registration | No | — | No `registerCommand`, `ctx.tools`, `dsh-client-runtime`, `ctx.slots`, `useSession`, `__ModuleLoader__`, `PLUGIN_ID`, etc. The plugin has no Client face and no `dsh.client` manifest. | none | High |
| #6 custom HTTP/WS/RPC/DOM/CSS channels | No | — | No `createServer`, `WebSocket`, loopback/localhost references, `router.*`, `/api/` (the only `api` text is the `apiProxy` identifier, already counted under #3), no DOM/CSS manipulation. | none | High |
| #7 subprocess / stdout/stderr parsing | No | — | No `child_process`, `spawn`, `exec*`, `execa`, `headless`, `--profile` references. The plugin only logs to `console.error` and does not parse any process output. | none | High |

Dependency/configuration layer (checked separately per pre-flight step 0, and it is
where the real breakage lives):

- package.json:17 declares `"@deepseek-ai/dsh-host-apiproxy": "0.0.1-rc.1"`. Per
  DSH-0.1.2-A1-01's identifiers note, alpha.1 **deletes that package entirely**. On
  0.1.2-alpha.2 this dependency cannot resolve; install of the plugin fails or the
  resolution graph is broken even before any code runs.
- No `peerDependencies`, `engines`, or `dsh-plugin.json` manifest present. The
  `dsh.bundle.patch` field points at the composition file (classified per API-08).

## 2. Hit touchpoints mapped to change cards

### #3 → DSH-0.1.2-A1-01 (APIProxy removed; breaking; required-if-hit) + API-01 ledger

- The plugin is a **Host-plane (server-side) Cordis plugin** (no `dsh.client` in
  package.json, no Client code), so per the A1-01 field note and API-01's core rule the
  correct migration is NOT `ctx.remote.*` — `remote` exists only on the Client face.
  Mechanically switching `inject: ["apiProxy"]` to `inject: ["remote"]` would leave the
  host waiting forever: `pending (waiting for service: remote)`.
- Correct Host-plane migration of `ctx.apiProxy.llm.providers()`: inject the owning
  domain service directly, e.g. `export const inject = ['llm']` and call
  `ctx.llm.listProviders()` (API-01 "Minimal correct patterns for Host"). The old one
  call `llm.providers` splits into `llm/listProviders` + `llm/listConfigurableProviders`
  on the Client projection; on the Host the target-tag service methods must be confirmed
  against the actual `llm` service declarations of 0.1.2-alpha.2 before writing code.
- Dependency action: remove `@deepseek-ai/dsh-host-apiproxy` from package.json
  (package deleted in alpha.1); the 0.1.2 cohort must stay exact and coherent
  (rollup-0.1.2 corridor rules; DSH-0.1.2-A2-03 packaging behavior).

### #3 → DSH-0.1.2-A2-02 (Remote failures become RemoteError; required-if-hit, applies after migration)

- index.js:7-14 wraps the call in a `try/catch` that swallows every error into a
  `console.error`. A2-02 explicitly lists "wrapping every call in a defensive catch" as
  a misclassification pattern: on the migrated surface, ordinary business/carrier
  failures arrive as  RemoteResult values, not rejections, and assembly faults should
  surface rather than be swallowed. The error-handling shape must be revisited as part
  of the migration, not carried over verbatim.

### Composition file (non-hit, classification note)

- `cordis.patch.yml` is profile composition per API-08; it inserts the plugin by id and
  needs no source-patch card. It only remains valid insofar as the plugin package
  identity/exports it references keep resolving after the dependency fix.

## 3. Do the zero-hit categories prove compatibility with 0.1.2-alpha.2?

**No. Zero hits on six of seven categories does not mean this plugin is compatible —
and this very fixture proves it:** the single #3 hit plus the dependency inventory is
already a hard breakage (a deleted npm package in `dependencies` and a removed service
in `inject`), despite categories #1, #2, #4, #5, #6, #7 all being clean.

Basis, per the skill's own authorities:

1. references/pre-flight.md header: "This is a heuristic scan, not proof of
   compatibility. Zero hits across the seven classes only means 'not detected by the
   current patterns'; you must still check dependencies/configuration and run a build,
   a real mount, and functional smoke tests." The scan patterns are regex heuristics
   over text; they cannot see data flow, runtime service resolution, or packaging
   behavior.
2. The touchpoint scan deliberately excludes the dependency/configuration layer
   (pre-flight step 0 handles it separately). Here that layer is where the fatal
   problem lives — `@deepseek-ai/dsh-host-apiproxy@0.0.1-rc.1` no longer exists on the
   target corridor.
3. references/README.md: the card sets are "curated", i.e. only identified
   plugin-relevant changes, "not a complete API diff". No hit against the scanned
   patterns cannot rule out changes outside the curated cards or outside the seven
   classes (e.g. packaging/export surfaces, cohort coherence, loader behavior).
4. The fixture is a static copy with no lockfile and no resolved install; the actual
   resolution identity of the DSH cohort on the target host is unknown from source
   alone (SKILL.md shared preparation step 2).

What is still needed before any compatibility conclusion (mandatory post-migration
verification, listed here per the task brief — not executed in this task):

- **Baseline + static**: run build/typecheck/tests in the repository's own dependency
  state first (Mode C step 0), record pre-existing failures, then re-run after
  migration; for the alpha.2 corridor close out references/precision-checklist.md
  (runtime module composition versus type declarations; here: no `dsh.client`, so
  Client-face items do not apply).
- **Dependency resolution**: after removing the deleted package, scan the full lockfile
  (once one exists) for the old DSH cohort; keep the 0.1.2 cohort exact and coherent
  (rollup-0.1.2.md).
- **Enablement/runtime**: cold-boot an isolated profile and verify the plugin entry
  activates and its required/provided services do not stay pending —
  scripts/verify-runtime.mjs runs this layer end-to-end with failure attribution.
  Expected post-migration shape: `inject: ['llm']` resolves and
  `ctx.llm.listProviders()` returns; before migration this exact step would hang/fail
  on the missing `apiProxy` service.
- **Behavioral smoke**: execute one core path (the provider-listing call) covering
  success and one failure branch, with error handling shaped per DSH-0.1.2-A2-02
  (no blanket defensive catch).
- **Wrapper**: exit codes, stdout/stderr, cancellation, teardown of the host profile run.

Pending/unsupported gaps stated honestly:

- The `from` tag is inferred from code style and the dependency version, not from a
  git tag or a resolved install (static copy); if the plugin actually ran on a tag
  older than rc.2, corridor segments before rc.2 are an unsupported gap and must be
  derived from exact-tag source before migration (SKILL.md Mode C step 1).
- The exact Host-plane `llm` service method names on 0.1.2-alpha.2 must be confirmed
  against the target tag's declarations (`.d.ts`/implementation), per A1-01 recipe
  rule "the generated declarations are authoritative"; this report does not invent them.

## Summary template (from pre-flight.md)

```markdown
## Touchpoint checkup (@demo/dsh-minimal-llm, dsh-v0.1.1-rc.2 → dsh-v0.1.2-alpha.2)

| Touchpoint | Hit | File/line | Applicable card | Confidence note |
|---|---:|---|---|---|
| #1 patch | No | package.json:9,13 (filename only) | API-08 classification | cordis.patch.yml = composition, not a source patch |
| #2 events | No | — | — | src/session-notes.js is pure utility, zero host coupling |
| #3 services/Remote | Yes | index.js:3,9 | DSH-0.1.2-A1-01, A2-02, API-01 | apiProxy inject + dot-domain call; package deleted in alpha.1 |
| #4 filesystem | No | — | — | no path/IO patterns |
| #5 UI/commands/tools | No | — | — | no client face, no dsh.client |
| #6 custom channel | No | — | — | no server/WS/DOM/loopback |
| #7 subprocess/output | No | — | — | only console.error logging |

No-hit notes: all 5 fixture files scanned, nothing excluded; dependency/config layer
checked separately and it is broken (@deepseek-ai/dsh-host-apiproxy deleted in alpha.1).
Must verify: build/typecheck, isolated-profile cold boot (verify-runtime.mjs), provider-listing smoke test, error-flow reshaping per A2-02.
```

## Bottom line

The plugin is **not** compatible with 0.1.2-alpha.2 as-is: one required-if-hit card
(DSH-0.1.2-A1-01) fires on its only host integration, and its declared dependency no
longer exists. The migration is small (rewrite index.js to `inject: ['llm']` +
`ctx.llm.listProviders()` after confirming target-tag declarations, remove the deleted
dependency, reshape the defensive catch per DSH-0.1.2-A2-02), but the six zero-hit
categories contribute no evidence of compatibility — only absence of detected risk —
and the mandatory verification ladder above must still run after the change.
