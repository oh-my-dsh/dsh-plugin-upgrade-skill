# S2 - Negative Scan: Compatibility Touchpoint Report

**Plugin:** `@demo/dsh-minimal-llm` v0.1.0 (fixture copy, read-only static scan)
**Target runtime:** dsh 0.1.2-alpha.2
**Source scanned:** `/app/fixture/` - 5 files, 2034 bytes total
**Scan mode:** static, read-only. No file under `/app/fixture/` was modified. SHA-256 of all 5 fixture files was re-verified as UNCHANGED against `fixture-seal.pre.json` after the scan completed.
**Scope note:** dsh is not installed in this container and the source is a non-executable static copy. Every conclusion below comes from source reading plus pattern scanning only. No live-host probing was performed.

---

## 0. Scan inventory (complete file set)

| File | Bytes | Role |
|---|---|---|
| `index.js` | 619 | Plugin entry - the only file with host coupling |
| `package.json` | 361 | Manifest and dependency declaration |
| `cordis.patch.yml` | 68 | Host patch descriptor |
| `src/session-notes.js` | 389 | Pure utilities - decoy, see section 4 |
| `README.md` | 599 | Fixture note, not plugin code - excluded from hit counts |

No hidden files, no `.ts`, no `tests/`, no lockfile, no CI config, no `node_modules/`.

---

## 1. The seven touchpoint categories - hit / no-hit with evidence

The seven categories are the standard dsh upgrade touchpoint taxonomy. The header comment at `index.js:1` and `README.md:3` both independently state that this plugin hits exactly one category - number 3, internal service / Remote (`apiProxy`). The scan confirms that independently from source evidence.

| # | Touchpoint category | Verdict | Evidence |
|---|---|---|---|
| **1** | **Service provision / dependency declaration** (`provides`, `provide`, `implements`) | **NO HIT** | No `provides` / `provide` / `implements` token anywhere in the plugin. The token `inject` appears only at `index.js:3` as `export const inject = ["apiProxy"]`, which is a consumption-side injection of a host-provided service, not a provision-side service declaration. Verdict: no hit as a provider. The single `inject` entry is counted under category 3 instead. |
| **2** | **Event bus / event subscription** (`ctx.bus`, `.on()`, `.emit()`, event names) | **NO HIT** | Pattern `ctx.bus` / `.on(` / `.emit(` / `.off(` / `.event` returned 0 matches across all files. The exhaustive list of `ctx.*` usages in the whole plugin contains only two entries (`index.js:7`, `index.js:9`) and neither is a bus or subscription call. No event-name string constants exist. |
| **3** | **Internal service / Remote service usage** (`apiProxy`, dot-domain calls, remote clients) | **HIT** | `index.js:3` - `export const inject = ["apiProxy"]`<br>`index.js:9` - `const providers = await ctx.apiProxy.llm.providers()`<br>`index.js:10` and `index.js:12` - log lines naming `apiProxy.llm.providers()`<br>`index.js:2` - comment: `0.1.1-rc.2 style: injects apiProxy, dot-domain calls.`<br>`package.json:17` - `"@deepseek-ai/dsh-host-apiproxy": "0.0.1-rc.1"`<br>This is the only hit category, and it is a two-part hit: the service name `apiProxy` is injected by the host, and the call shape is a dot-domain call `apiProxy.llm.providers()`. |
| **4** | **Config / schema surface** (`ctx.config`, `Schema.*`, config keys) | **NO HIT** | `ctx.config` returned 0. `Schema.` and `Config.` returned 0. The tokens `config` and `Config` returned 0 in all files. The plugin declares no configuration surface and no config schema, so it cannot be affected by config-schema reshaping. |
| **5** | **Tool / command registration** | **NO HIT** | Patterns `tool`, `command`, `register` returned 0 matches across all files. The plugin registers no tool, no slash command, and exposes no command surface. |
| **6** | **Client-side / UI surface** (`client`, `ui`, theme, tokens, slots, views) | **NO HIT** | The only matches for `client` / `ui` / `theme` / `token` / `slot` / `view` were in `README.md:5` prose, which is not code. In code the only occurrences of the letters `ui` are incidental substrings inside the log strings `[minimal-llm] ...` at `index.js:6,10,12`. No client plugin, no UI component, no theme token, no slot-tree participation. |
| **7** | **Manifest / dependency / packaging surface** (`package.json` shape, host-service package pins, `cordis.patch.yml`) | **HIT (partial)** | `package.json:16-18` carries a direct dependency on a host-service package: `"@deepseek-ai/dsh-host-apiproxy": "0.0.1-rc.1"`. It also carries a `dsh.bundle.patch` pointer to `./cordis.patch.yml` (`package.json:11-15`) plus a matching `exports` entry (`package.json:9`). `cordis.patch.yml` is a 3-line patch descriptor inserting one plugin record (`id: minimal-llm`, `name: "@demo/dsh-minimal-llm"`). This is a manifest hit, not a behavioural hit: it is the packaging consequence of category 3, and it is the surface most likely to break on a version bump. |

### Auxiliary findings (not among the seven, but migration-relevant)

- **Lifecycle / async:** `ctx.effect(async () => { ... })` at `index.js:7`. This is the only host-lifecycle call in the plugin and it is the wrapper that runs the API call.
- **Error handling:** `index.js:11-13` wraps the call in `try/catch` and only logs the failure instead of rethrowing. Consequence: if the 0.1.2 `apiProxy` shape changed and the call rejected, the plugin would still boot successfully and silently - it would print one line to `stderr`. This silent-failure mode is the single most important operational risk in this plugin.
- **Logging:** `console.error` at `index.js:6,10,12`. Direct `console`, not a host logger. No `ctx.logger` exists, so there is no logging-surface migration to perform.
- **No static imports at all:** the token `import` returned 0 occurrences and `require(` returned 0 occurrences. The plugin has zero module-level dependency edges. The only dependency edge is the host-injected `apiProxy`.
- **The declared host-service package is never imported.** `@deepseek-ai/dsh-host-apiproxy` appears exactly once, at `package.json:17`, and no source file references it. It is a host-service package pin consumed by the host, not a library import.

---

## 2. Mapping the hit touchpoints to the specific change cards

**Limitation, stated plainly:** the read whitelist for this task contains **no change-card catalog**. The complete whitelisted file set is the 5 fixture files plus 5 task-material files (`instruction.md`, `solver-prompt.txt`, `subagent-id.txt`, `fixture-seal.pre.json`, `fixture-seal.source.json`). A whitelist-wide search for `card`, `0.1.2`, `alpha`, `corridor`, `breaking` and `reference` produced no card IDs and no catalog document - only the prose of the task itself. Specific card IDs therefore **cannot be cited from available material**, and the boundary rules forbid going outside the whitelist to obtain them.

What follows maps each hit touchpoint to the **card it must correspond to**, identified by subject matter, so the mapping can be resolved against the real catalog by whoever holds it. Card IDs are marked UNCONFIRMED wherever the catalog would supply them.

| Hit touchpoint | Subject of the card it maps to | Card ID |
|---|---|---|
| **#3** - `inject = ["apiProxy"]` (host service name used as a string key) | Card covering **host-service name and injection-key stability**: does the host still expose the service under the identifier `apiProxy` in 0.1.2-alpha.2, or was the service renamed, re-namespaced or slugged? | UNCONFIRMED - catalog not in whitelist |
| **#3** - `ctx.apiProxy.llm.providers()` (dot-domain call shape) | Card covering **dot-domain / service API surface reshaping**: is the `<service>.<domain>.<method>()` shape preserved in 0.1.2-alpha.2, or flattened, renamed, or moved behind a Remote / RPC boundary? | UNCONFIRMED - catalog not in whitelist |
| **#3** plus **#7** - `"@deepseek-ai/dsh-host-apiproxy": "0.0.1-rc.1"` | Card covering **host-service package versioning and dependency resolution for 0.1.2-alpha.2**: what version of `@deepseek-ai/dsh-host-apiproxy` ships with, or is required by, 0.1.2-alpha.2, and does the current `0.0.1-rc.1` pin still resolve against it? | UNCONFIRMED - catalog not in whitelist |
| **#7** - `cordis.patch.yml` insert-record shape and the `dsh.bundle.patch` manifest pointer | Card covering **patch / manifest descriptor schema**: did the `cordis.patch.yml` insert-record schema, or the `dsh.bundle.patch` manifest key, change between 0.1.1 and 0.1.2-alpha.2? | UNCONFIRMED - catalog not in whitelist |
| **#7** - `exports` map, `"type": "module"`, `"main"` | Card covering **plugin manifest and entry-point resolution**, if the catalog has one. Likely NO CHANGE - ESM plus `main` plus `exports` is stable across the corridor. | UNCONFIRMED |

**Cards that are structurally irrelevant to this plugin** - listed so migration effort can be triaged correctly, because their trigger surface sits in a zero-hit category:

- Service-provision / `provides` registration card - no provider surface.
- Event-bus / event-name / event-payload card - no subscriptions, no event names.
- Config / config-schema / config-migration card - no config surface at all.
- Tool / command registration card - nothing registered.
- Client-UI / theme-token / client-plugin card - no client surface.
- Plugin lifecycle and disposal card - only `ctx.effect`, no `onDispose`, no `onDeactivate`, no timer to clean up.
- Host-logger migration card - no `ctx.logger`, uses `console.error` directly.

### Card-by-card against the corridor

The fixture note at `README.md:5` states the intended method: check card by card against the corridor. Applied here:

- **Card hits** (must be read and applied): the #3 service-name card, the #3 dot-domain card, the #3/#7 apiproxy-package card, and the #7 patch-schema card. **Four cards require checking.**
- **Card no-hits** (the six or more listed above): structurally unreachable, because their trigger tokens do not exist in the source. Reading them is optional; they cannot produce work for this plugin.
- **Net result:** the migration surface for this plugin is **narrow but real**. It is not zero. The four cards above are exactly the cards whose applies-to preconditions this plugin satisfies.

---

## 3. The central question: can the zero-hit categories tell me the plugin is compatible with 0.1.2?

### Verdict: **No. Zero hits is not equivalent to compatible.** The premise that it is tiny and should have no compatibility problems is **not supported** by this scan.

### Basis for that judgment

**(a) The zero-hit categories are provably unreachable, not provably compatible.**
A no-hit result is only informative when the category trigger surface is present but unchanged. Here, categories 1, 2, 4, 5 and 6 have no trigger surface at all in this plugin: no config, no events, no tool registration, no provider, no UI. The absence of a hit there means there is nothing to migrate in that area. That is a statement about the size and scope of the plugin, not a statement about what changed in 0.1.2. Those are different propositions. A one-line plugin is zero-hit across most categories for the trivial reason that it does almost nothing.

**(b) The categories that do have a trigger surface are exactly the ones that were hit, and they carry the entire risk.**
The whole coupling of this plugin to dsh is compressed into two expressions:
- `export const inject = ["apiProxy"]` (`index.js:3`)
- `await ctx.apiProxy.llm.providers()` (`index.js:9`)

Both are legacy-shape by the fixture own admission (`index.js:2`: `0.1.1-rc.2 style: injects apiProxy, dot-domain calls`), and the log text at `index.js:6` calls it the old API path (`旧 API（apiProxy）路径`). If 0.1.2-alpha.2 renames the service, reshapes the dot-domain, or re-versions `@deepseek-ai/dsh-host-apiproxy`, then the only two things this plugin does both break - and no zero-hit category would warn about it, because zero-hit categories are silent by construction.

**(c) A zero-hit on a category cannot speak to the specific card that matters.**
This is the decisive distinction. The question of compatibility with 0.1.2 is a question about **cards** - concrete, versioned API changes. The seven categories are a coarse pre-filter that routes you to the right cards. A category no-hit tells you that no card in that group applies to you. It does not tell you that every card which does apply to you is a no-change card. Only the mapping in section 2 can make that determination, and for this plugin that mapping resolves to **four cards that must be read**, not zero.

**(d) The dependency pin is a concrete, dated break risk that no category scan clears.**
`package.json:17` pins `@deepseek-ai/dsh-host-apiproxy@0.0.1-rc.1` - a release-candidate version of a host-service package. A pre-release pin against a pre-release host (`0.1.2-alpha.2`) is exactly the pairing that silently stops resolving. Category 7 turns on a version number, and version numbers are precisely what a no-API-token-changed reading never inspects.

**(e) The failure mode is silent, so reading the source cannot detect it.**
`index.js:11-13` catches the error and only logs it. Under a broken `apiProxy` shape the plugin would install, apply, boot cleanly, and print a single error line to `stderr`. A source scan cannot rule this out; only execution can.

### What the zero-hit scan can legitimately claim (the honest, bounded conclusion)

> Across the seven touchpoint categories, this plugin touches only #3 (internal service / Remote) and, as its packaging consequence, #7 (manifest and dependency). The other five categories are structurally unreachable, so no migration work exists in them. The migration surface of this plugin is small and concentrated - which is genuinely good news and is a real finding.

That is a statement about scope and triage, not about compatibility. Scope is what the scan measures; compatibility is what the cards plus execution determine.

### What is still needed before a compatibility conclusion can be drawn

**A. Card-level resolution (mandatory - and the card catalog was not available in this run).** Read the four cards from section 2 and resolve each to an explicit verdict against the 0.1.2-alpha.2 corridor:

1. Is the host service still injected under the identifier `apiProxy`?
2. Is `apiProxy.llm.providers()` the same shape in 0.1.2-alpha.2, or has it been flattened, renamed, or moved behind a Remote / RPC boundary?
3. Does `@deepseek-ai/dsh-host-apiproxy@0.0.1-rc.1` resolve against 0.1.2-alpha.2, or is a different host-service package version required?
4. Did the `cordis.patch.yml` insert-record schema, or the `dsh.bundle.patch` manifest key, change?

Until each of these four has a positive, cited answer, the word compatible is **unproven**.

**B. Mandatory post-migration verification.** Per the brief these are required steps after the migration; this task records them and does not run them, because the source is a non-executable static copy with dsh not installed.

| # | Verification step | What it proves | Why it matters here |
|---|---|---|---|
| **V1** | **Build / typecheck.** No build script and no `.ts` exist, so the minimal equivalent is a resolution and import check: install the manifest, confirm the `exports` map and the `dsh.bundle.patch` pointer resolve. | The plugin installs and its entry points resolve. | The `@deepseek-ai/dsh-host-apiproxy@0.0.1-rc.1` pin may not resolve under a 0.1.2-alpha.2 host. |
| **V2** | **Isolated-profile cold boot.** Fresh throwaway dsh profile, plugin installed, host started clean with no prior profile state. | The plugin is discovered, its `cordis.patch.yml` record is applied, and `apply()` runs without host startup errors. | A stale profile can mask a broken patch record; only a cold boot in an isolated profile exercises the real path. |
| **V3** | **Functional smoke test.** Assert that `ctx.apiProxy.llm.providers()` resolves and returns a provider list, not merely that it does not crash. | The behaviour still works. | Critical because `index.js:11-13` swallows errors - a clean boot alone looks like success even when the call failed. The smoke test must assert the resolved value. |
| **V4** | **stderr inspection** during boot and during the smoke run: no `[minimal-llm] apiProxy.llm.providers() 失败` line appears. | The legacy call path actually succeeded. | Directly targets the silent-failure mode of the try/catch at `index.js:11-13`. |
| **V5** | **Clean-shutdown / disposal check.** | No leaked handles after unload. | Low risk here since there are no timers and no `onDispose`, but cheap to confirm that `ctx.effect` completes cleanly. |

**C. If the four cards cannot be obtained**, the honest position is: the migration surface is a single service call plus its package pin; whether the 0.1.2-alpha.2 corridor preserves that exact shape is **unconfirmed from the source alone**, so compatibility cannot be asserted. The scan alone, with no cards and no execution, yields *small, concentrated and unverified* - not *compatible*.

---

## 4. Decoy handled: `src/session-notes.js`

`src/session-notes.js` is **not** a touchpoint hit. Its filename suggests a session or event coupling, but a full read shows pure string and array utility code:
- `formatSessionNote(text)` - trims the input, collapses whitespace runs to a single space, caps the result at 200 characters.
- `chunk(lines, size)` - slices an array into fixed-size chunks.

Evidence of zero host coupling: no `ctx`, no `inject`, no `import`, no event, no config, no timer, no file or network I/O. The word session appears only in a comment at `session-notes.js:1`, and even that comment states the naming is only a historical naming habit. A cross-reference scan confirms the file is imported by nothing: 0 references outside itself and the README. It is dead code in this fixture.

**Classification: no-hit, and it is a false-positive trap rather than a real touchpoint.** A filename-keyed scan would have wrongly flagged it and inflated the hit count.

---

## 5. Summary against the three requirements

| Requirement | Result |
|---|---|
| **1. Hit / no-hit with evidence for each of the seven categories** | Done - section 1. Five no-hit (1, 2, 4, 5, 6, each with file:line evidence), two hit (3, and 7 as partial). |
| **2. Map hit touchpoints to the specific change cards** | Partial by environment limitation - section 2. Mapped to card subjects with the trigger evidence; **card IDs are UNCONFIRMED because no card catalog exists inside the read whitelist**. |
| **3. Can the zero-hit categories establish 0.1.2 compatibility?** | Answered in section 3: **No.** Zero hits is not equivalent to compatible. Zero hits establish scope, not compatibility. Basis: (a) no-hit categories are unreachable-by-absence rather than proven-unchanged; (b) all real risk sits in the single hit category; (c) categories are a pre-filter while cards are the actual API-change statements; (d) the RC dependency pin is a concrete break risk invisible to a no-token-changed reading; (e) the try/catch makes breakage silent, so only execution can rule it out. |
| Fixture unmodified | Yes - SHA-256 of all 5 fixture files re-verified UNCHANGED against `fixture-seal.pre.json` after scanning. |
| Verification steps recorded | Yes - section 3-B: V1 build/typecheck, V2 isolated-profile cold boot, V3 functional smoke test asserting the resolved value, V4 stderr inspection, V5 clean shutdown. Not executed, by design. |

### Bottom line

**This plugin is small, but it is not proven compatible.** Its migration surface is genuinely narrow - two expressions and one dependency pin - and that narrowness is the useful, actionable finding from the scan. But the seven touchpoint categories can only tell you where to look, and the only category this plugin touches is the one the fixture itself flags as the old API path. **Compatibility must be concluded from the four cards in section 2 plus the five verification steps in section 3-B - not from the six empty categories.** Until then the correct status is: **low migration scope, compatibility unconfirmed, silent-failure risk if wrong.**
