# Scoring rules and checkpoint mapping

Total 2300 (23 tasks × 100; the Harbor reward is 0–1, normalized as score/100).
Every judge: exit 0, with the last stdout line
`{"score": 0-100, "max": 100, "reasons": [...]}`; `tests/test.sh` parses that last
line as JSON and writes score/100 to `/logs/verifier/reward.txt`.

## Task → card / rollup recipe → score breakdown

| Task | Checkpoint (cards / rollup recipes) | Score breakdown |
|---|---|---|
| S1-static-scan | Seven-touchpoint self-check (pre-flight.md); **corridor folding**: DSH-0.1.2-A1-02 ↔ DSH-0.1.2-A2-01; DSH-0.1.2-A1-01 / A1-03 / A1-04 / A1-08 | Expected card set {A1-01, A1-02, A1-03, A1-04, A1-08, A2-01}: 100/6 ≈ 16.7 per card; fixture modified → flat 0 (read-only discipline) |
| S2-negative-scan | pre-flight.md negative checklist "scanning is not a compatibility proof"; DSH-0.1.2-A1-01 | Map the hit category to A1-01 (40) + account for the zero-hit categories (20) + zero hits ≠ compatibility (20) + state that verification is required (20); fixture modified → flat 0 |
| S3-snapshot-migration | DSH-0.1.2-A1-03 session-view split (legacy projection in two steps / useSession / cordis type imports / slots.inject) | Five points, 20 each: legacy projection, useSession, @deepseek-ai/cordis, slots.inject, reference to card A1-03; fixture modified → flat 0 |
| H4-tsbuildinfo-trap | migration-hygiene §1 (build-cache false positive); DSH-0.1.2-A1-21 field note (the reverse of the trap) | Recognize the cache false positive (30) + handle it with clean (30) + conclude that the source needs no changes (40); src modified → flat 0 (the trap); a report applying A1-21 recipe-style changes (presets/, resolveRecordedPreset) caps at 30 |
| M1-host-migration | DSH-0.1.2-A1-01 host-plane migration (inject `llm` + `ctx.llm.listProviders()`); dead-dependency cleanup (#5120 pain point #2) | Container cold-boot activation: 100; modified but still pending / plugin tree failed: 40; `dsh plugin add` failed: 30; fixture untouched: 0 |
| H1-plane-trap | DSH-0.1.2-A1-01 field note "determine the plane before choosing the injection name"; validation report section 4 (wrongly switching to remote → `pending (waiting for service: remote)`) | Same bands as M1; plus a static gate: inject contains remote but not llm → capped at 20 (the comment trap) |
| H2-baseline-trap | rollup R-06 pre-migration baseline attribution | Report contains baseline/pre-existing/exemption attribution, kept separate from the migration (60) + container activation (40) − quietly fixing the pre-existing test file (30, floor 0); fixture untouched: 0 |
| H3-client-plane | DSH-0.1.2-A1-01 client-plane contract (package.json must declare `dsh.client`); DSH-0.1.2-A1-19 acceptance anchor; DSH-0.1.2-A2-02 RemoteResult (inside the solution) | `dsh.client` declared completely (platform=web, 40) + add succeeded (10) + host-side startup without pending (10) + `__DSH_BOOT__.entries` actually contains this plugin (40); fixture untouched: 0. Note: `dsh.client` without platform is a **loud failure** (boot fails immediately with `dsh.client.platform must be a string`), and that form caps at 30; only the completely missing declaration (the trap's original state) is silent |
| H5-runtime-export-drift | DSH-0.1.2-A2-10 `dsh-settings` removes the runtime `settingsNamespace` export; rollup R-11 type-surface export drift; API-03 provider-owned lifecycle | The judge installs via **pack → tarball → add** only (a link install masks the drift, so it is disabled): pack/add/boot all green with no static issues → 100; add succeeded but the real boot failed (named export / plugin tree failed / pending) → 40; pack or add failed → 30; fixture untouched → 0; old-runtime pin (an old `@deepseek-ai/dsh-settings` pulled into runtime through any of dependencies/optionalDependencies/peerDependencies/overrides/pnpm.overrides) or a hand-rolled settingsNamespace shim → **capped at 20 even when the boot is green**; boot green but the migration is incomplete (still imports settingsNamespace, or the devDeps cohort is not aligned to alpha.2) → **capped at 60**; host downgraded/tampered (dsh version, global dsh-settings export surface) → 0 |
| M5-token-auth-smoke | DSH-0.1.2-A1-08 · Web/API channels use process-scoped bootstrap tokens and signed cookies; connection-registered channels are covered, raw `webServer.register` routes are not | Checkpoint-graded ([tests/checkpoints.json](../tasks/M5-token-auth-smoke/tests/checkpoints.json), dual pristine/patched runs per [checkpoint-grading.md](checkpoint-grading.md)): authed-200 pass-to-pass 40 + no-auth-401 fail-to-pass 40 + raw-route-removed fail-to-pass 20, failing the last caps the total at 60 (hand-rolled auth bypasses the host's unified auth). Gates: fixture untouched or dsh unavailable ⇒ 0; `dsh plugin add` failed ⇒ 30; boot or smoke unmeasurable ⇒ 40. A drifted trap fixture (fail-to-pass baseline already passing) ⇒ baseline mismatch, 0 |
| H8-fire-drill | DSH-0.1.2-A1-01 · APIProxy removed, Host/Web Client calls moved to `@Remote`; DSH-0.1.2-A1-08 · Web/API channels use process-scoped bootstrap tokens and signed cookies; R-01 · Target cohort dependency packages not fully published to npm; plugin-release publish gates (verify-release.mjs, prerelease dist-tag routing) | Checkpoint-graded ([tests/checkpoints.json](../tasks/H8-fire-drill/tests/checkpoints.json), dual pristine/patched runs per [checkpoint-grading.md](checkpoint-grading.md)): diagnosis 20 (names 15 + cards 5), static fixes 30 (host 4+3+3, web 4+3+3, tools 5+5), deploy 30 (install 10 + boot 10 + smoke 401/200 5+5 with `requires`), release 20 (versions 9 + checklist gates 11). Remote bait ⇒ capped at 20 (H1 precedent); smoke green with raw `webServer.register` still present ⇒ capped at 60 (M5 precedent); fixture untouched or dsh unavailable ⇒ 0; a drifted trap fixture ⇒ baseline mismatch, 0 |
| H9-dsh-web-alpha2 | dsh-web [v0.3.8](https://github.com/zhu1090093659/dsh-web/tree/v0.3.8) → [v0.3.9](https://github.com/zhu1090093659/dsh-web/tree/v0.3.9); DSH-0.1.2-A2-02 / A2-03 / A2-10 | Static 100: migrate 13 settings consumers (39) + web-settings bridge (6) + peer/direct dependencies and git-graph session edge (15) + npm cohort/lockfile/workflows (10) + aggregate exclusions (15) + task-board qualified error code (10) + upstream script regressions (5). At 80+, the judge performs a full workspace install/build, installs the 17-family local tarballs through the official CLI, cold-boots dsh 0.1.2-alpha.2 Web, and checks the boot manifest; runtime failure caps at 80 and non-target edits cap at 90 |
| H10-browser-activation-trap | DSH-0.1.2-A1-26 client registration id must equal package name; DSH-0.1.2-A1-19 browser acceptance anchor | fixture changed (else 0) + `dsh plugin add` (10) + boot manifest entry (15) + bundle HTTP 200 from the browser (15) + Chromium observes the fixture-owned activation marker with no package activation failure (60). The unchanged trap earns 40: discovery and delivery pass, execution does not |
| S4-legacy-client-imports | DSH-0.1.2-A1-25 client-runtime package removal; DSH-0.1.2-A1-26 register-id-must-equal-package-name; DSH-0.1.2-A1-27 session content reads; DSH-0.1.2-A1-30 `ctx.connection.api` removal | Expected card set {A1-25, A1-26, A1-27, A1-30}: 25 per card; claiming A1-25 is "type-only and therefore harmless" treats it as missed; fabricated deterministic "cards" (apply-lifecycle replacement, inject-moved-to-manifest) cap at 70; fixture modified → flat 0 |
| S5-negative-naming | plugin-write naming profile (official short names valid, warnings ≠ errors); registry-check four states | Four verdicts, 25 each: `greet` is a valid official short name (no compatibility error), unprefixed service `search` is a recommendation/warning, events are shared channels (informational), unqueried registry = unknown; asserting "reserved/globally available" scores 0 for that item; claiming "everything passes" caps at 30; fixture modified → flat 0 |
| H6-remote-error-trap | DSH-0.1.2-A2-02 error-flow vocabulary; DSH-0.1.2-A1-30 field note (silent swallow) | Four points, 25 each: namespaced codes `gateway/cancelled` + `gateway/internal` (half credit 12 for "namespaced but exact spelling unconfirmed"), cancel terminates/propagates without retry, internal/unknown reported without blind retry, silent swallow removed; following the comment (keep old codes) caps at 25; recommending cross-realm `instanceof RemoteError` caps at 50; fixture modified → flat 0 |
| S6-corridor-net-state | DSH-0.1.2-A1-02 ↔ DSH-0.1.2-A2-01 corridor folding (remove-then-restore) | Four points, 25 each: both cards appear, conclusion is to delete the defense code, producer semantics (only informational events carry `ignorable: true`), public `Session.append` capability gap without cast; following the comment (keep deleting the marker / keep the defense) caps at 10; fixture modified → flat 0 |
| S7-unpublished-cohort | rollup R-01 unpublished cohort; npm semver caret semantics | Four points, 25 each: registry check first, a workable path (overrides tarball or exact pin + lockfile), exit path/discipline (no package-manager switching), recognizing the silent caret resolution to `0.1.2-alpha.2`; prescribing a direct install of alpha.1 caps at 10; fixture modified → flat 0 |
| M2-optional-dep-trap | DSH-0.1.2-A2-03 field note #2 (optional dependency with a top-level import) | fixture changed (else 0) + static gates (dependency moved to `dependencies` with a published range, top-level import intact — try/catch or dynamic-import wrapping is not the fix) + isolated-profile cold boot (`MISSING_CREDENTIAL` without a key: 100 when the static gates hold; changed but broken / wrapped: 40; `dsh plugin add` failed: 30). The judge installs the fixture with the `file:` form so plugin dependencies land in the profile graph |
| M3-session-projection | DSH-0.1.2-A2-08 (missing inject service = runtime pending) | fixture changed (else 0) + the judge composes a profile from the fixture files and cold-boots: `MISSING_CREDENTIAL` without a key AND the composed tree still contains `@deepseek-ai/dsh-tool-todo` (100); pending / plugin tree failed (40); the todo tool dropped from the final composition entirely (0 — dodging) |
| M4-peer-prerelease-range | rollup R-08 #3 (prerelease lower bound does not match the target cohort) | fixture changed (else 0) + static range gate (peer and dev bounds must cover 0.1.2-alpha.2) + cold boot (`MISSING_CREDENTIAL`: 100 when the bounds are fixed; changed-but-unfixed: 40; add failed: 30); `*`-style meaningless ranges cap at 40. Boundary: the R-08 "warnings disappear after rewriting" signal cannot be reproduced in this harness — the profile's pnpm graph never contains the host's fallback-provided peers, so the judge scores bounds statically plus a real cold boot |
| H7-locale-trap | rollup R-13 (display-text anchoring breaks silently after localization) | fixture changed (else 0) + static gates (data-slot anchor without the display-text regex: 30; explicit render assertion — throw/assert, a silent `return` does not count: 10) + `dsh plugin add` (10) + host half no pending (10) + `__DSH_BOOT__.entries` contains the plugin (40); a display-text regex (even multi-language) caps at 40. Boundary (same as H3): no browser in the container, client.js runtime behavior is not graded |
| S8-release-routing-trap | profile-dependency-management.md §8 version routing + §9 tag sync (real 2026-08-31 incident) | Five diagnosis aspects × 20, exactly as the judge scores them: attempt-1 tag-missing attribution (v0.9.5), attempt-2 forward-incompatibility symptom (useConversation), version direction identified (alpha.x build on rc.x runtime), rc-compatible remedy (v0.9.3 — valid only once the missing tag is pushed to the mirror), maintainer tag-sync fix (push --tags to every mirror); fixture modified → flat 0 |

## Liveness signals (shared convention for container tasks)

| Signal | Meaning |
|---|---|
| `pending (waiting for service: …)` / `plugin tree failed` / `did not activate` | plugin tree not activated → failure band (40) |
| named-export failure (`does not provide an export named …`) | ESM runtime export drift → failure band (40; the main H5 symptom) |
| headless cold boot shows `MISSING_CREDENTIAL` (no API key in the container) | startup reached the host application layer → plugin tree activated as a whole, pass |
| after a web cold boot the page boot manifest contains `<plugin>/client.js` | browser-roster recognition (H3/H10; delivery, not execution) |
| Chromium observes the plugin's fixture-owned DOM activation marker | browser client actually executed and activated (H10) |

Exit codes are not a criterion: without an API key, a successful activation also
exits 1, exactly like a failed one — this is the "read the symptom line, not the exit
code" checkpoint (the attribution principle from the validation report).

## Verdict boundaries

- H3: there is no browser inside the container, so client.js is not executed at
  runtime; "browser plane pass" means the host-advertised `__DSH_BOOT__` boot manifest
  contains this plugin's entry. The runtime behavior of the `RemoteResult`
  error-flow branch is not covered.
- H10 is the narrow exception: Chromium executes client.js and must observe the
  activation marker. Manifest presence and a 200 response are deliberately partial.
- M1/H1/H2/H3/H5-runtime-export-drift/H9-dsh-web-alpha2: only "activation + service call reachable" is verified; no full round of
  real conversation is run (no API key); a route count of 0 is expected and not a
  failure. H5-runtime-export-drift additionally installs only via the pack → tarball → add path (a link
  install carries the fixture's own node_modules along and masks the runtime drift);
  settings namespace registration reads/writes do not do a settings-panel round trip.
- M5: no browser inside the container, so the verdict is HTTP-status-level only — 401
  without the Cookie and 200 after the token exchange; DOM behavior and page-level
  flows are not covered. A hand-rolled check inside a raw `webServer.register` route
  still answers 401/200 but is capped at 60 (it bypasses the host's unified auth).
- H8: the deploy verdict is HTTP-status-level only (401 without the Cookie, 200 after
  the token exchange); no browser is involved, so DOM/page behavior is not covered.
  The release act is judged on version bumps and checklist content only — nothing is
  actually published inside the container.
- H9-dsh-web-alpha2 preserves the v0.3.8 source slice, including relevant code,
  configuration, and test text; only byte-identical binary assets and unrelated Markdown
  are excluded. Its verifier checks 66 v0.3.9 target files, runs the upstream script
  regressions, and forces all 17 `@linxin666/*` family dependencies to candidate local
  tarballs rather than substituting npm's published v0.3.9.
- Container-task judges only create the `bench-*` profile and the `/tmp/bench-*`
  directories and clean them up when the run ends; nothing else in the environment is
  touched.

## Known noise

- pnpm link installs occasionally take 10s or more, so ordinary hands-on judge timeouts
  are generous (add 180s, boot 60s, web 150s). H9-dsh-web-alpha2 also performs a cold
  install, build, and pack of the real workspace, so its verifier timeout is 900s rather
  than the ordinary 600s.
- H10 also starts system Chromium; its 600s verifier budget includes browser startup.
- Every Harbor trial is a fresh container, so tasks are naturally isolated and no
  manual fixture restoration is needed; repeated runs of the same task do not affect
  each other's profiles.
