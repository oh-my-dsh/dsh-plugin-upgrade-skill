# JUDGE BRIEF · noskill.S2-negative-scan

## Criteria (sealed rubric)
- [host-break] (40pt) Locate index.js inject/apiProxy.llm.providers and map the breaking Host service to A1-01. Explain llm injection/listProviders and the dead apiproxy dependency in package.json; a card name alone earns zero.
- [negative-coverage] (20pt) Account for each of the other six categories with scanned-file evidence. session-notes.js is a pure string/array utility; cordis.patch.yml is ordinary plugin composition, not a host-source patch. Interpret a negative patch conclusion in its touchpoint-category context: wording such as no patch file/declaration under the source-patch category can correctly mean no host-source patch, especially when the scan scope includes the composition file. Do not deduct solely because an ordinary composition file has patch in its name, or require an extra explanation of that naming distinction when the category conclusion and scan evidence are correct. Still deduct for an explicit denial that the existing composition file itself exists, for misclassifying its insertion as host-source modification, or for unsupported negative conclusions. Do not invent coupling from filenames.
- [inference-boundary] (20pt) Explain why no static hits cannot establish compatibility: scan coverage is limited and dependency/config/runtime behavior needs separate evidence. Distinguish the existing decisive apiProxy break from the six negative categories.
- [verification-plan] (20pt) Specify post-migration build/typecheck, an isolated target-version cold boot with no pending, and an actual provider call. These are proposed checks, not checks supposedly executed inside this non-runnable fixture.

## Caps (score ceilings; judge returns each with triggered true/false)
(none)

## Candidate report(s)
#### FILE: S2-negative-scan/S2-negative-scan-report.md

# S2 · Negative Scan Report — @demo/dsh-minimal-llm → dsh 0.1.2-alpha.2

## 0. Scan scope and method

- Target: `fixture/` — static source copy (dsh not installed, not executable). Read-only scan; no file under `fixture/` was modified.
- Coverage: **exhaustive** — the plugin has only 5 files / ~52 lines total, every line was read:
  - `fixture/README.md` (5 lines)
  - `fixture/cordis.patch.yml` (3 lines)
  - `fixture/index.js` (15 lines) — entire plugin logic
  - `fixture/package.json` (19 lines)
  - `fixture/src/session-notes.js` (10 lines)
- Method: per-category pattern scan of all source, followed by manual line-level review of every API touchpoint.

## 1. Hit / no-hit conclusion per touchpoint category

| # | Touchpoint category | Verdict | Evidence |
|---|---|---|---|
| 1 | Manifest / packaging (`package.json`, `dsh` field, exports) | **NO HIT** (with caveat, see §4) | `package.json:11-15` uses the standard `dsh.bundle.patch` block and `exports` map; both conform to the unchanged format. Caveat: the pinned dependency `"@deepseek-ai/dsh-host-apiproxy": "0.0.1-rc.1"` (`package.json:17`) is the old-API package — counted as evidence under #3, since its only purpose is providing `apiProxy`. |
| 2 | Patch descriptor (`cordis.patch.yml`) | **NO HIT** | `cordis.patch.yml:1-3` is a plain `insert` of `{id, name}`; no renamed/removed patch keys, no deprecated fields. |
| 3 | Internal service / Remote (`apiProxy`) | **HIT** | `index.js:3` `export const inject = ["apiProxy"]`; `index.js:9` `await ctx.apiProxy.llm.providers()` (dot-domain call); `index.js:6,10,12` log lines confirm the apiProxy code path; `package.json:17` pins `@deepseek-ai/dsh-host-apiproxy@0.0.1-rc.1`. |
| 4 | Plugin lifecycle & context API (`inject` / `apply` / `ctx.effect` / dispose) | **NO HIT** | `index.js:5` `apply(ctx)` signature and `index.js:7` `ctx.effect(async () => ...)` use the lifecycle surface in its unchanged form; no dispose-related deprecated usage. |
| 5 | Events / hooks (event names, emit/on payloads) | **NO HIT** | No `ctx.on`, `ctx.emit`, listener registration, or event-name string anywhere in the source. |
| 6 | Config / schema (plugin config declaration) | **NO HIT** | No config schema export, no `ctx.config` access, no settings keys. |
| 7 | Client / UI surface (client plugins, slots, theme tokens) | **NO HIT** | No client entry, no slot/theme/UI imports; plugin is host-side only. |

Note on `src/session-notes.js`: the filename looks session-related (suspicious at first glance), but the content is two pure utility functions (`formatSessionNote`, `chunk`) with zero imports and zero host coupling — **no hit in any category**. It is a decoy; pattern-only filename matching would have produced a false positive.

## 2. Mapping of hit touchpoints to change cards

| Touchpoint | Change card | What must change (per card key points) |
|---|---|---|
| #3 Internal service / Remote (`apiProxy`) | **Card #3 — apiProxy removal / Remote internal-service migration (0.1.2-alpha.2)** | (a) Remove `apiProxy` from `inject` and inject the real target service(s) directly instead of going through the proxy facade; (b) rewrite dot-domain calls of the form `ctx.apiProxy.<domain>.<method>()` — here `ctx.apiProxy.llm.providers()` (`index.js:9`) — to the card-specified direct-service equivalent; (c) drop the now-obsolete dependency `@deepseek-ai/dsh-host-apiproxy` from `package.json:17`. |

Exactly one card applies. All other categories are no-hit, so no other change cards are triggered.

## 3. The key question: do zero-hit categories prove 0.1.2 compatibility?

**Judgment: No. Zero hits ≠ compatible.**

Basis:

1. **A negative scan is absence-of-evidence, not evidence-of-absence.** A hit/no-hit scan over the seven touchpoint categories proves only "no *known* incompatible pattern from the 0.1.1→0.1.2-alpha.2 delta was found in the scanned surface." It says nothing about:
   - changes without a syntactic marker (behavioral/semantic changes, changed return shapes, timing/ordering changes);
   - anything outside the scan list (undocumented or newly introduced breaking changes);
   - runtime wiring failures: service availability, `inject` resolution, patch application order — all fail only at boot, leaving no static trace.
2. **The question is moot for this plugin anyway.** Category #3 has a confirmed hit: as-is, this plugin is **not** compatible with 0.1.2-alpha.2. The six zero-hit categories only mean the blast radius is small (one file, two lines, one dependency), not that migration can be skipped.
3. **Even a hypothetical all-zero scan would not close the question.** This fixture is a static copy — dsh is not installed and nothing is executable — so the decisive evidence (does it boot? do the services resolve? does the feature work?) is unobtainable from scanning alone.
4. **Residue risk in "clean" categories:** the pinned `@deepseek-ai/dsh-host-apiproxy@0.0.1-rc.1` dependency would silently reintroduce the old API surface even if all call sites were rewritten — a packaging-level fact that a pure call-site scan could miss.

**What zero-hit categories *do* tell you:** they reliably narrow the risk surface and triage effort — here they let us state with confidence that migration work is confined to touchpoint #3 and that no event/config/UI/lifecycle rewrites are needed.

**What else is needed before concluding compatibility** (mandatory post-migration verification, to run after applying card #3 — listed here per the brief, execution not required in this task):

1. Apply the #3 migration (inject target service directly, rewrite `ctx.apiProxy.llm.providers()`, remove the `dsh-host-apiproxy` dependency).
2. **Build / typecheck** against dsh 0.1.2-alpha.2 — catches signature drift the text scan cannot see.
3. **Isolated-profile cold boot** — proves `inject` resolution, patch application, and `apply()` succeed under the new host with no stale state.
4. **Functional smoke test** — exercise the actual feature path (list LLM providers) and compare behavior with the pre-migration baseline.

Only after steps 2–4 pass may the plugin be called compatible with 0.1.2-alpha.2.

## 4. Summary

- **Hits:** 1 of 7 categories — #3 Internal service / Remote (`apiProxy`), evidenced at `index.js:3`, `index.js:9`, `package.json:17`. Mapped to change card #3 (apiProxy removal / Remote migration).
- **No-hit:** categories 1, 2, 4, 5, 6, 7 (with the `session-notes.js` decoy confirmed clean by content, and the packaging caveat on the pinned apiProxy dependency noted).
- **Conclusion:** the plugin is small and the migration is confined to a single touchpoint, but it is **not** compatible as-is; and in general, zero-hit categories can never by themselves certify compatibility — they only bound the unknowns. Build/typecheck, isolated-profile cold boot, and a functional smoke test remain mandatory after migration.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.