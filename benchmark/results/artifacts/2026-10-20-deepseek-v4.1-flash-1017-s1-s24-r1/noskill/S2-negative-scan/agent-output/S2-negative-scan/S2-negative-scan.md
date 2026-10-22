# S2 · Negative Scan — `@demo/dsh-minimal-llm` against dsh 0.1.2-alpha.2

**Verdict in one line:** 1 of 7 touchpoint categories has a hit (**TP-3 Internal service / Remote — `apiProxy`**); the other 6 are zero-hit, **but zero hits does not establish compatibility**. The plugin is *probably small to migrate* (one card), not *proven compatible*. Compatibility stays unproven until the TP-3 card is applied and the mandatory build / cold-boot / smoke verification passes.

---

## 1. Scope and method

- Mode: **read-only static scan**. No file under `fixture/` was modified (SHA-256 inventory in §7), nothing was installed, no migration was executed, no network access, no git.
- Files in scope (complete, including hidden files — directory was listed with `-Force -Recurse`, no dotfiles or extra assets exist):

| File | Bytes | Role |
|---|---|---|
| `fixture/package.json` | 361 | manifest, dependency pins, bundle patch declaration |
| `fixture/index.js` | 619 | actual plugin body (`inject` + `apply`) |
| `fixture/cordis.patch.yml` | 68 | bundle patch (plugin insertion) |
| `fixture/src/session-notes.js` | 389 | pure utility module (suspicious name, no coupling) |
| `fixture/README.md` | 599 | fixture note (not authoritative — claims were re-checked independently below) |

- Method: for each of the seven categories I first fixed a **scan rule** (what syntactically/semantically counts as a hit), then read every line of every file against that rule, then cross-checked the one positive hit against its dependency metadata and runtime lifecycle. The README's own claim ("only #3 hits") was treated as a hypothesis, not as evidence.

---

## 2. Seven-category hit / no-hit table

Legend: **HIT** = coupling surface exists and is affected by the 0.1.2-alpha.2 corridor; **no hit** = no such surface present in the source.

| # | Touchpoint category | Scan rule used | Result | Evidence |
|---|---|---|---|---|
| 1 | Package manifest / entry / `exports` / bundle patch | `package.json` fields, `main`/`exports`, `dsh.bundle.patch`, `type`, presence of an entry that Cordis can load, patch file syntax | **no hit** | `package.json:2-15` (ESM, `main`+`exports` consistent, `dsh.bundle.patch` points to an existing file); `cordis.patch.yml:1-3` is a valid `insert:` list with `id` + `name`. No removed field, no renamed entry point. Advisory only (see §5.3): no `engines` / `peerDependencies` / api-version marker. |
| 2 | Client / Web UI (client entry, slots, props, theme tokens) | any `client` export, slot registration, React/Vue component, `theme` token, web bundle manifest | **no hit** | No client code at all; the only entry is Node-side `index.js`. |
| 3 | **Internal service / Remote (cross-plugin service access, `apiProxy`, dot-domain calls)** | `inject` of a host service, `ctx.<service>.<domain>.<method>()` access, dependency on a host service package | **HIT** | `index.js:3` `inject = ["apiProxy"]`; `index.js:9` `ctx.apiProxy.llm.providers()` (dot-domain call); `index.js:2` self-describes as "0.1.1-rc.2 style"; `package.json:17` pins `@deepseek-ai/dsh-host-apiproxy@0.0.1-rc.1`. |
| 4 | Event / lifecycle (event names, `ctx.on`/`emit`, effect & dispose) | event subscriptions, string event names, `ctx.effect` usage and its disposer contract | **no hit** (no event surface; one adjacent lifecycle defect recorded in §5.2, which is version-independent, not a card hit) | No `ctx.on` / `emit` / event-name strings anywhere. `index.js:7` uses `ctx.effect(async …)` — see advisory. |
| 5 | Tool / command / schema registration | `ctx.tool`, `ctx.command`, tool name, JSON/TypeBox input schema, permission metadata | **no hit** | No registration calls, no schemas, no tool/command ids. |
| 6 | Config schema / options | exported `Config`/`Schema`, config keys read from `ctx.config`, per-plugin settings in the patch | **no hit** | `index.js` exports only `inject` and `apply`; the patch entry `cordis.patch.yml:2-3` carries only `id` + `name`, no `config:` block. |
| 7 | Persistence / storage / prompt-resource contribution | session-store or DB access, file paths, prompt/skill/resource injection | **no hit** | `src/session-notes.js:2-9` are pure string/array helpers (`trim`, regex collapse, `slice`, `chunk`); no I/O, no `ctx` parameter, no storage import. The word "session" in the filename is naming only. |

**Hit count: 1 / 7.** Category 3 is the only card-bearing hit; everything else is genuinely absent from this source.

---

## 3. Mapping of the hit touchpoint to change cards

Only one card set applies. Card reference is given by the corridor's touchpoint numbering (**TP-3 = Internal service / Remote**); the card's subject — *internal-service access via `apiProxy` / dot-domain calls* — is the unambiguous identifier, since no other card in the corridor concerns service access.

**Card: TP-3 · Internal service / Remote (`apiProxy` → 0.1.2 service access)** — applies to `index.js` and `package.json`.

| # | Required change | Where | Why |
|---|---|---|---|
| 3-a | Replace the service identity in `inject` with the 0.1.2 registered service id; do not keep `"apiProxy"` on faith. | `index.js:3` | The service name is the migration contract. The 0.1.1-rc.2 "dot-domain" service shape is what the corridor changes; the new id must be taken from the 0.1.2 host service registry (inspect/service list), **not guessed from this source**. |
| 3-b | Rewrite the call site `ctx.apiProxy.llm.providers()` to the 0.1.2 access path, and **re-check the return shape** (array vs map vs paginated object) at the call site. | `index.js:9` | The call is the only functional behaviour of the plugin; a same-signature/different-shape change is exactly the class of breakage a static scan cannot rule out. `JSON.stringify(...).slice(0,160)` would silently degrade to `"[object Object]"` or throw. |
| 3-c | Update or drop the pinned host dependency `@deepseek-ai/dsh-host-apiproxy@0.0.1-rc.1` so it resolves against 0.1.2-alpha.2 (or remove it if the service is provided by the host runtime and must be a peer/optional dependency). | `package.json:17` | This pin is the last 0.1.1-rc.2 artifact in the package. A stale internal package version is a hard install/resolution failure even when the code is otherwise clean. |
| 3-d | Make activation order explicit: if the service is not guaranteed to exist at `apply()` time, gate the call (`ctx.inject([...], …)` / ready hook) instead of a bare `ctx.effect` body. | `index.js:5-14` | Internal/RPC services can attach later; a synchronous `apply` + immediately-invoked async body is a race on 0.1.2. |
| 3-e | Keep the failure path visible: the `catch` currently only `console.error`s and then the plugin stays "loaded". Acceptable for a demo, must be a conscious decision for a real plugin. | `index.js:11-13` | Silent degradation hides a failed migration during smoke test. |

**Acceptance criteria for the card:** (i) no deprecation / "service not found" warning at boot; (ii) `providers()` returns the expected payload and the log line prints a real list, not `undefined`/`[object Object]`; (iii) dispose/unload leaves no listener or timer behind.

---

## 4. The question you actually asked: do the six zero-hit categories tell you it is compatible?

**No. Zero hits are a bounded negative, not a compatibility proof.** Judgement, with the basis:

1. **A scan answers "does this pattern exist in this text?", not "does this plugin work on that runtime?"** The six no-hit categories only exclude the specific syntactic surfaces I scanned (client slots, event names, tool/command schemas, config schemas, storage I/O, manifest fields). They say nothing about behaviour, semantics, or the runtime contract.
2. **The one hit sits on the highest-risk surface.** This plugin does *nothing except* call a host-internal service. Its entire functional surface is the surface the corridor changes. Six clean categories carry almost no weight against a 100 %-exposed TP-3: the "risk mass" is concentrated, not averaged.
3. **Package-level compatibility is out of the scan's reach.** The runtime target is 0.1.2-alpha.2 while `package.json:17` pins a `0.0.1-rc.1` internal package. Whether that range resolves, whether the package still exists under that name, and whether the host declares a peer range the plugin must satisfy — all of this is decided by the package manager and the host manifest, not by source text.
4. **Runtime-only contracts are invisible here.** Bundle-patch validation, plugin activation order, service availability timing at `apply()`, and the `ctx.effect` disposer contract are all enforced (or not) at runtime. None of them is a "touchpoint category" that a grep can hit.
5. **Semantic changes never show up as hits.** If 0.1.2 keeps the same service name but changes the payload of `llm.providers()` (shape, paging, error type), the scan still reports zero hits in six categories and the plugin still breaks in production. Absence of a signature change is not absence of a behaviour change.
6. **False negatives are structural.** This is plain JavaScript with no types: a dynamic lookup (`ctx.get('apiProxy')`), a string-built service id, or a re-export from a dependency would be invisible to a text scan. Today's source happens to be literal, but "the scan found nothing" and "nothing exists" are different claims.
7. **The README's own framing is a trap worth naming.** A fixture note asserting "only one touchpoint, so it should be fine" is exactly the reasoning error to avoid: one hit on TP-3 means *one card to apply*, not *one risk*.

**Therefore:** the correct conclusion is *"small migration surface, single card, compatibility unproven"*. Do not report "no compatibility problems"; report "no other cards apply, and the one card that applies must be applied and verified".

### What is still needed before a compatibility statement can be made

- The real 0.1.2-alpha.2 service contract for the `apiProxy` replacement (registered id, payload shape, availability timing). **This cannot be derived from this source** — it must come from the 0.1.2 host's service registry / changelog. Until then, items 3-a/3-b are open questions, not decisions.
- A decision on 3-c: keep the dependency (and bump it) or rely on the host runtime (peer/optional).
- The three mandatory post-migration verifications in §6 (build/typecheck, isolated-profile cold boot, functional smoke test), plus the negative case (service absent → plugin must fail loudly, not silently).

---

## 5. Findings outside the seven categories (recorded, not counted as card hits)

These do not change the 1/7 count, but they change the migration checklist, and a report that omitted them would over-state readiness.

### 5.1 Stale internal dependency pin
`package.json:17` — `@deepseek-ai/dsh-host-apiproxy@0.0.1-rc.1`. This is the single strongest signal that the package predates the target runtime, and it is a *resolution* risk independent of the code. Cards for TP-1 (manifest) do not cover it because the manifest *shape* is valid; the risk is the internal package's version line.

### 5.2 `ctx.effect` with an async callback
`index.js:7-14` — `ctx.effect(async () => { … })`. The async arrow returns a `Promise`, not a disposer. Depending on the 0.1.2 effect contract this either registers no cleanup at all (leak on unload/reload) or is rejected as an invalid effect. This is **not** a 0.1.1→0.1.2 change card — it is a latent defect in the legacy code that the migration should fix while touching the file, and it is precisely the kind of thing a "no hits" scan cannot surface.

### 5.3 Missing compatibility metadata (advisory)
`package.json` declares no `engines`, no `peerDependencies`, and no explicit target-runtime/api-version marker. For a plugin consumed by a host at a pinned alpha version, that is how "works on my 0.1.1" silently becomes "breaks on 0.1.2". Adding an explicit engine/peer range is cheap insurance, and would have made this whole question answerable by inspection.

### 5.4 Logging-only failure handling
`index.js:11-13` swallows the error into `console.error`. During smoke test this looks like success if nobody reads stderr. For migration verification, the failure must be observable (non-zero exit / health signal), otherwise §6's smoke test can pass on a broken plugin.

---

## 6. Mandatory verification after migration (to be executed then; not executed here)

`dsh` is not installed in this environment and the fixture is a static copy, so the following are **specified, not run**:

1. **Install + build / typecheck.** Resolve dependencies against 0.1.2-alpha.2 (no `--force`, no stale lockfile), then build and typecheck the package. This catches 3-c and any manifest/export error. A typecheck over plain JS also catches the `Promise`-vs-disposer misuse in `index.js:7` if `checkJs` is on.
2. **Isolated-profile cold boot.** Boot the host with a throwaway profile containing only this plugin (and its declared deps). Assert: plugin loads, patch is accepted, no deprecation / "service not found" / "unknown service" warning, and the service is present when `apply()` runs.
3. **Functional smoke test.** Assert `providers()` returns the expected payload (real list, correct length/shape), that the log line is populated, and that the plugin's observable behaviour matches the 0.1.1 baseline.
4. **Negative-path test.** Start with the host service unavailable/disabled and confirm the plugin fails *visibly* (per 5.4) rather than reporting success.
5. **Reload / dispose test.** Enable → disable → re-enable (or restart) and confirm no duplicated effects/listeners/handles — the check that catches 5.2.
6. **Diff review.** Confirm the diff is limited to `index.js` + `package.json`; `cordis.patch.yml` and `src/session-notes.js` should be untouched (they had no hits, and touching them adds risk without benefit).

Only after 1-5 pass may the report be upgraded from "compatibility unproven" to "verified against 0.1.2-alpha.2".

---

## 7. Integrity of the scan

`fixture/` was not modified. SHA-256 at scan time:

| File | SHA-256 |
|---|---|
| `fixture/README.md` | FDCA9077F0C9FB810F365D890F677E1CAB35208E1FFC78AE9D1B3F54AA39D479 |
| `fixture/package.json` | 414ADB496685D6467D57740ACF03AECCDB343F1D231B2B3F05E354124508602E |
| `fixture/index.js` | 7306621926891CDF7D26EF268725B5F386213CE8410259947A30662117B0A866 |
| `fixture/cordis.patch.yml` | D50C34AE80E26E0DD0AB56B9E2835A6B3049665B8777027033FF52695CA02ABE |
| `fixture/src/session-notes.js` | 7A3219984C595F4C927E386B54E688C9ACE2D0A50CAD0E72A436F93C9C673748 |

No temporary files were created outside `agent-output/`; no install, no migration, no execution of plugin code.
