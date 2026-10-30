# S2 · Negative Scan — `@demo/dsh-minimal-llm` → dsh 0.1.2-alpha.2

**Target migration:** 0.1.1-rc.2 style → **0.1.2-alpha.2**
**Scanned source (read-only, static copy, unmodified):** `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-12-step5-preview-s1-s24-r1\noskill\S2-negative-scan\fixture\`
**Post-scan fixture integrity:** 5 files, SHA-256 re-verified identical to the pre-write snapshot (see §7).

---

## 1. Scope constraint that shapes this report (read this first)

The workspace boundary for this task permits reading only the fixture directory and writing only the report directory. It explicitly forbids the skill's upgrade materials, the change-card catalog, the reference answers, the repository docs, and `solution/`/`tests/`. Consequently:

- I could **not** read the authoritative seven-touchpoint-category list, the change cards, or the migration corridor.
- I could **not** cite card identifiers, and this report does not invent any.
- Category **#3** is the only one I can name authoritatively, because the fixture's own `README.md:3` states it: *"hits only one touchpoint category (#3 internal service/Remote: `apiProxy`)"*.

For the remaining six rows I reconstructed scan dimensions from the observable source surfaces. Those rows are labelled **[R…]** and marked **reconstructed**. A "no hit" on a `[R…]` row means *no hit under my reconstruction of that dimension*, **not** *no hit under the authoritative category*. Mapping my rows onto the authoritative list is a required follow-up (§6.1).

---

## 2. Complete inventory of the scanned source

| File | Bytes | What it is |
|---|---|---|
| `index.js` | 619 | The entire plugin: 1 `inject` export, 1 `apply(ctx)`, 1 `ctx.effect`, 1 host call |
| `package.json` | 361 | ESM manifest, patch-layer bundle declaration, 1 pinned dependency |
| `cordis.patch.yml` | 68 | Patch-layer bundle: one bare `insert` entry |
| `src/session-notes.js` | 389 | Two pure utility functions, zero host coupling |
| `README.md` | 599 | Fixture description |

Scan coverage: recursive `-Force` listing of the fixture returned exactly these five files and one directory (`src/`). No hidden files, no `.dsh/`, no lockfile, no `node_modules/`, no TypeScript config, no test files.

Whole-source regex sweep run over all five files: `ctx.`, `inject`, `service`, `session`, `event`, `emit`, `tool`, `spawn`, `exec`, `subprocess`, `e2b`, `sandbox`, `terminal`, `config`, `cordis`, `!!js`, `next(`, `effect`, `dispose`, `on(`, `waterfall`, `schema`, `version`, `alpha`, `rc.`, `dsh`, `host`, `llm`, `proxy`, `provider`, `import`, `require`, `node:`, `child_process`, `process.`, `Buffer`, `__dirname`, `__filename`, `fetch(`, `http`, `net.`, `os.`, `fs.`, `path.`, `dynamic`.

---

## 3. Hit/no-hit by touchpoint category

### Category #3 — Internal service / Remote seam · **HIT** *(name authoritative, from `README.md:3`)*

This is the confirmed hit, and it is the only one the source's own annotation claims. Three separable sub-surfaces, which must be judged independently:

| # | Sub-surface | Evidence | Verdict |
|---|---|---|---|
| 3a | Injected service key `apiProxy` | `index.js:3` `export const inject = ["apiProxy"]`; `index.js:9` `ctx.apiProxy.llm.providers()` | **Unresolved hit** |
| 3b | Nested dot-domain accessor `llm.providers()` | `index.js:9` | **Unresolved hit** |
| 3c | Response payload **shape** | `index.js:10` `JSON.stringify(providers).slice(0,160)` | **NO HIT — evidence-backed** |

- **3a/3b.** `index.js:9` is the entire coupling: a service key declared at `index.js:3`, one level of nested domain (`llm`), and one method call (`providers()`). Each is an independent public-API surface of the api-proxy seam. If 0.1.2 renamed the injected key, re-scoped `llm`, or changed `providers()` to a different name or a getter, this line throws.
- **3c is the one clean and load-bearing negative.** The plugin *stringifies* the result and never inspects a field. A response-payload change therefore **cannot** break it. This narrows the blast radius to the access path only (3a/3b) — useful, and it is the strongest "no hit" claim in this report.

### Category [R1] — Session log / event coupling (`SessionEventMap`, session persistence & projection) · **NO HIT** *(reconstructed)*

Evidence: no `ctx.on(`, no `ctx.emit`, no event-name string, no session-log read or write anywhere in the sweep. `src/session-notes.js:2` exports `formatSessionNote(text)`, but it is a string normaliser (`String(text).trim().replace(/\s+/g,' ').slice(0,200)`), not a log writer. `index.js` writes only to `console.error` (`index.js:6,10,12`), which is host stderr, not the session log.

### Category [R2] — Model-visible surface (system prompt, tool definitions, tool results, user-visible output) · **NO HIT** *(reconstructed)*

Evidence: no tool registration, no tool parameter schema, no prompt construction, no result card, no user-facing output stream in the sweep. `console.error` output is developer diagnostics, not model-visible or product-user-visible text.

### Category [R3] — Plugin protocol & lifecycle (`apply`, effects, hooks, waterfall listeners, dispose) · **NO HIT on the protocol / HAZARD on the effect body** *(reconstructed)*

- `index.js:5` `export function apply(ctx)` and `index.js:7` `ctx.effect(...)` are the current idiomatic registration form, not a deprecated one.
- No waterfall listener, therefore the "waterfall listeners MUST call `next()`" rule is not engaged. No `dispose`, no `ctx.on`.
- **The hazard is not compatibility, it is observability** — see §4.3. The effect body's `try/catch` (`index.js:8-13`) converts every host-coupling failure into a log line.

### Category [R4] — Configuration & composition surface (`cordis.yml` / patch-layer schema, package manifest fields, dependency specs) · **HIT** *(reconstructed)*

This is the hit that a JS-only scan would miss entirely. Three files carry it:

1. `package.json:17` — `"@deepseek-ai/dsh-host-apiproxy": "0.0.1-rc.1"`. An **exact pin** (no range) onto an rc.1 of a host package, while the target is 0.1.2-alpha.2. The pin must move to the 0.1.2 line, and if the package was renamed, split, or absorbed into the Remote BFF package, resolution fails outright.
2. `package.json:11-15` — `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`. A patch-layer bundle declaration whose schema must be re-validated against 0.1.2.
3. `cordis.patch.yml:1-3` — a bare plugin entry resolved **by package name**:
   ```yaml
   - insert:
       - id: minimal-llm
         name: "@demo/dsh-minimal-llm"
   ```
   `package.json:17` declares a dependency on `@deepseek-ai/dsh-host-apiproxy`, **not** on `@demo/dsh-minimal-llm` itself. Whether that is a resolver-manifest violation depends on which manifest the 0.1.2 loader treats as the resolver manifest for a bundle patch layer. **Not determinable from this static copy** → open question, §6.3.
4. `package.json` declares **no `peerDependencies` entry for the cordis host runtime**. The plugin therefore never states which host runtime it was authored against.

Sub-rules checked and **not** engaged:
- The `!!js` / `!js` configuration codirection rule does not apply — the entry carries no `config:` block and no `disabled` key (`cordis.patch.yml` is 3 lines, both directives absent).
- The "no hardcoded tunables in plugins" rule does not apply — the plugin exposes zero configurable fields; there is nothing to promote to a `Config` field.

### Category [R5] — Host process boundary (subprocess, shell, E2B, terminal, launcher, package bins) · **NO HIT** *(reconstructed)*

Evidence: zero matches for `spawn`, `exec`, `subprocess`, `shell`, `e2b`, `sandbox`, `terminal`, `child_process`, `node:`, `process.`, `Buffer`, `__dirname`, `__filename`. `package.json` declares no `bin`, so the "only `dsh` profiles launch supported Node apps" rule is not engaged.

### Category [R6] — Cross-boundary public API / SDK surface, branded opaque ids, protocol constants · **NO HIT** *(reconstructed)*

Evidence: the only exported symbols consumed across a package boundary are `inject` (`index.js:3`) and `apply` (`index.js:5`). `package.json:7-10` `exports` exposes `"."` and `"./cordis.patch.yml"` only. No branded type usage, no protocol constants, no SDK projection. `src/session-notes.js` exports two functions but — see §4.2 — they are unreachable.

### Summary

| Category | Verdict | Confidence |
|---|---|---|
| #3 Internal service / Remote | **HIT** | High (authoritative name; direct code evidence) |
| [R4] Configuration & composition | **HIT** | High (3 files, direct evidence) |
| [R3] Plugin protocol & lifecycle | NO HIT (protocol) | Medium |
| [R1] Session log / events | NO HIT | Medium |
| [R2] Model-visible surface | NO HIT | Medium |
| [R5] Host process boundary | NO HIT | Medium |
| [R6] Public API / SDK / branded ids | NO HIT | Medium |

**Two of seven categories hit. The "six zero-hit" framing in the original premise is wrong: the plugin is not a six-zero-hit case.**

---

## 4. Mapping the hits to change areas

I cannot name card identifiers — the card catalog is outside my permitted read paths, and the task forbids citing them. I therefore map each hit to the **change surface**, and record the card id that must be filled in from the catalog.

### 4.1 Hit A — internal-service / Remote access path (`index.js:3`, `index.js:9`)

Change surface: the api-proxy internal-service seam, specifically (i) the injected context key `apiProxy`, and (ii) the nested domain accessor `llm.providers()`. Migration action is confined to those three tokens; `src/session-notes.js` and the payload handling are untouched.

- **Card id: UNRESOLVED.** The api-proxy / Remote BFF seam cards for 0.1.2-alpha.2 must be read from the catalog to confirm whether `apiProxy`, `llm`, and `providers()` moved.
- Evidence that the hit is real rather than nominal: `index.js:2` self-labels the style — *"0.1.1-rc.2 style: injects apiProxy, dot-domain calls."*
- Evidence that the hit is *narrow*: `index.js:10` consumes the result only via `JSON.stringify`, so sub-surface 3c is clean (§3, row 3c).

### 4.2 Hit B — configuration & composition surface (`package.json`, `cordis.patch.yml`)

Change surface: (i) the pinned dependency spec, (ii) the patch-layer bundle declaration, (iii) the bare-plugin resolver entry, (iv) the absent cordis peer dependency. Each is load-time or install-time; none appears in any JS scan.

- **Card id: UNRESOLVED.** The bundle/patch-layer, manifest, and dependency-alignment cards for 0.1.2-alpha.2 must be read from the catalog.

### 4.3 Not a hit, but the reason negative evidence is worthless here — `index.js:8-13`

```js
try {
  const providers = await ctx.apiProxy.llm.providers()
  console.error("[minimal-llm] apiProxy.llm.providers() 成功 →", ...)
} catch (error) {
  console.error("[minimal-llm] apiProxy.llm.providers() 失败 →", error.message)
}
```

Every failure of the one coupled call is caught and reduced to a `console.error` line. This means: a missing `apiProxy`, a renamed `llm` domain, and a changed `providers()` signature all produce **identical observable behaviour to compatibility** — no throw, no non-zero exit, no loader error. `src/session-notes.js` gets no coverage from this, because see below.

---

## 5. False positive to discard: `src/session-notes.js`

`src/session-notes.js` is a decoy. Three independent pieces of evidence that it has **zero** host coupling:

1. **No context object anywhere.** No `ctx`, no injected service, no event, no log write — confirmed by the full-source sweep.
2. **Not reachable from the entry point.** `index.js` contains **zero `import` and zero `require` statements** (the only match for those tokens across all five files was the English word "required" inside `README.md:5`). Nothing imports `formatSessionNote` or `chunk`.
3. **Not reachable from the package.** `package.json:7-10` `exports` lists `"."` and `"./cordis.patch.yml"` only; `src/` is not exported.

The `session` substring in the filename and in `formatSessionNote` is naming, not coupling — `src/session-notes.js:1` says so explicitly. A keyword scan would flag this file into the session-log category; that flag would be wrong on both the category and the file.

Secondary finding, not a compatibility issue: since the module is unimported and unexported, it is dead code in the shipped package.

---

## 6. Can the zero-hit categories tell me this plugin is compatible with 0.1.2?

### Judgment: **No.** A zero-hit category is silent, and silence here is specifically worthless, for six reasons.

**1. The premise is false.** The plugin does not have a single hit and six zero-hits. It has a confirmed hit in the authoritative category #3 and a second, independent hit in configuration & composition. The question "can the zero-hit categories tell me it is compatible" is being asked about a plugin that is already known-not-clean.

**2. Five of the seven "no hit" verdicts are not authoritative.** I could not read the category list. My `[R…]` rows are reconstructions. A no-hit verdict on a reconstructed row carries no evidential weight against the real category, and there may be authoritative categories I did not reconstruct at all. This is the single largest reason a compatibility conclusion is impossible from this scan alone.

**3. The scan is structurally blind to exactly where this plugin is most likely to break.** The two files that carry the composition hit are `package.json` and `cordis.patch.yml` — not JavaScript. A scan of JS source, however thorough, cannot see a dependency pinned to `0.0.1-rc.1`, a patch-layer schema, a bare-plugin resolver entry, or a missing peer dependency. Everything in Hit B is invisible to a code-surface scan.

**4. The failure mode is silent by construction.** `index.js:8-13` catches and logs. Under 0.1.2 this plugin will load cleanly, boot cleanly, and exit cleanly whether or not it still works. Boot success, profile-load success, and exit-code success therefore carry **zero** information about compatibility here. The only discriminating signal is whether the *success* branch's log line appears — and because it goes to `console.error`, it must be captured explicitly or it will be missed.

**5. The dependency's own content is uninspectable.** `@deepseek-ai/dsh-host-apiproxy@0.0.1-rc.1` (`package.json:17`) is an external package. Whatever change cards it carries are not visible in this directory. A zero-hit scan of *this* source is not evidence about *that* source, and migrating the plugin while leaving the pin in place leaves the coupling precisely where it was.

**6. Zero hits covers the categories that were checked, and nothing else.** It is an absence of evidence in the checked rows, not evidence of compatibility. The correct reading of this scan is: *"the plugin's coupling is narrow and its blast radius is confined to one access path plus its manifest"* — which is a statement about **risk concentration**, not about compatibility.

**What the scan does establish, and it is worth stating:** the plugin is genuinely small and genuinely narrow. Its entire host coupling is `index.js:9`, one line. There is no tool surface, no session-log coupling, no model-visible surface, no process boundary, and no SDK projection — those six categories are clean under any reasonable reconstruction, and I would be surprised if the authoritative list disagreed. So the migration is *small*. Small is not the same as safe.

### 6.1 Required before a compatibility conclusion can be reached

1. **The authoritative seven-category list and the 0.1.1-rc.2 → 0.1.2-alpha.2 change-card corridor.** Re-run this scan with the exact category names and card ids. This is the blocking gap; nothing else substitutes for it.
2. **The 0.1.2 manifest for `@deepseek-ai/dsh-host-apiproxy`.** Does it still exist on the 0.1.2 line? Which version pin is correct? Was it renamed, split, or absorbed into the Remote BFF package? Until this is known, the dependency pin cannot be resolved and Hit B cannot be closed.
3. **The 0.1.2 patch-layer / bundle schema**, to validate the `insert:` + `id` + `name` entry shape at `cordis.patch.yml:1-3`.
4. **The host profile's resolver manifest**, to determine whether the bare `@demo/dsh-minimal-llm` entry resolves, and under which manifest.

### 6.2 Mandatory post-migration verification

Listed here as required, **not executed** — the source is a static copy with no installed runtime.

1. **Syntax and manifest validity.** `node --check index.js` and a strict `JSON.parse` of `package.json`. There is no TypeScript config and no build tooling in this package, so a normal build/typecheck step does not apply and must not be reported as passing.
2. **Dependency alignment.** Move `package.json:17` off the `0.0.1-rc.1` pin onto the 0.1.2 line, and add the cordis host runtime to `peerDependencies`.
3. **Isolated-profile cold boot.** Install the plugin as a `--profile` patch-layer bundle into a throwaway profile and boot headless. Confirm no loader rejection and no verify-cordis-config failure. **Do not treat a clean boot as a pass** — see §4.3.
4. **Functional smoke test that asserts on the success branch.** Capture `console.error` and assert the presence of `apiProxy.llm.providers() 成功`. A clean boot with only the `失败` line is a **failed** migration. This is the only test that distinguishes broken from compatible in this plugin.
5. **Dead-code decision on `src/session-notes.js`.** It is unimported and unexported. Either wire it up, export it, or delete it — but do not carry it forward unreviewed.

### 6.3 Unresolved questions carried forward

- Does the bare entry at `cordis.patch.yml:3` satisfy the resolver-manifest dependency rule, given that `package.json` does not declare `@demo/dsh-minimal-llm` as a dependency of itself?
- Does the 0.1.2 patch layer still accept a two-key (`id`, `name`) bare entry, or does it require position/`ref`/`source` keys?
- Does `ctx.effect` in this form still register on the 0.1.2 lifecycle, and does the emitted output still reach host stderr?

---

## 7. Fixture integrity

All scanning was read-only. Pre-write SHA-256 snapshot:

```
D50C34AE80E26E0DD0AB56B9E2835A6B3049665B8777027033FF52695CA02ABE  68   cordis.patch.yml
7306621926891CDF7D26EF268725B5F386213CE8410259947A30662117B0A866  619  index.js
414ADB496685D6467D57740ACF03AECCDB343F1D231B2B3F05E354124508602E  361  package.json
FDCA9077F0C9FB810F365D890F677E1CAB35208E1FFC78AE9D1B3F54AA39D479  599  README.md
7A3219984C595F4C927E386B54E688C9ACE2D0A50CAD0E72A436F93C9C673748  389  src/session-notes.js
```

All five files re-hashed after the report was written; digests, lengths, and modification times are unchanged. All five files also end with exactly one trailing newline and are UTF-8 without BOM.
