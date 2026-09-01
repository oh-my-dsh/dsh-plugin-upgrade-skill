# Scoring rules and checkpoint mapping

Total 1500 (15 tasks × 100; the Harbor reward is 0–1, normalized as score/100).
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
| M5-token-auth-smoke | DSH-0.1.2-A1-08 · Web/API channels use process-scoped bootstrap tokens and signed cookies; connection-registered channels are covered, raw `webServer.register` routes are not | Browserless HTTP smoke on a clean web profile: no-auth 401 + token-exchanged 200 ⇒ 100; no-auth 401 but the authed request is not 200 ⇒ 60 (the fix broke the channel); no-auth request still answered ⇒ 40 (channel still naked); raw `webServer.register` still present with an otherwise green smoke ⇒ capped at 60 (hand-rolled auth bypasses the host's unified auth); `dsh plugin add` failed ⇒ 30; fixture untouched or dsh unavailable ⇒ 0 |
| S4-legacy-client-imports | DSH-0.1.2-A1-25 client-runtime package removal; DSH-0.1.2-A1-26 register-id-must-equal-package-name; DSH-0.1.2-A1-27 session content reads; DSH-0.1.2-A1-30 `ctx.connection.api` removal | Expected card set {A1-25, A1-26, A1-27, A1-30}: 25 per card; claiming A1-25 is "type-only and therefore harmless" treats it as missed; fabricated deterministic "cards" (apply-lifecycle replacement, inject-moved-to-manifest) cap at 70; fixture modified → flat 0 |
| S5-negative-naming | plugin-write naming profile (official short names valid, warnings ≠ errors); registry-check four states | Four verdicts, 25 each: `greet` is a valid official short name (no compatibility error), unprefixed service `search` is a recommendation/warning, events are shared channels (informational), unqueried registry = unknown; asserting "reserved/globally available" scores 0 for that item; claiming "everything passes" caps at 30; fixture modified → flat 0 |
| H6-remote-error-trap | DSH-0.1.2-A2-02 error-flow vocabulary; DSH-0.1.2-A1-30 field note (silent swallow) | Four points, 25 each: namespaced codes `gateway/cancelled` + `gateway/internal` (half credit 12 for "namespaced but exact spelling unconfirmed"), cancel terminates/propagates without retry, internal/unknown reported without blind retry, silent swallow removed; following the comment (keep old codes) caps at 25; recommending cross-realm `instanceof RemoteError` caps at 50; fixture modified → flat 0 |
| S6-corridor-net-state | DSH-0.1.2-A1-02 ↔ DSH-0.1.2-A2-01 corridor folding (remove-then-restore) | Four points, 25 each: both cards appear, conclusion is to delete the defense code, producer semantics (only informational events carry `ignorable: true`), public `Session.append` capability gap without cast; following the comment (keep deleting the marker / keep the defense) caps at 10; fixture modified → flat 0 |
| S7-unpublished-cohort | rollup R-01 unpublished cohort; npm semver caret semantics | Four points, 25 each: registry check first, a workable path (overrides tarball or exact pin + lockfile), exit path/discipline (no package-manager switching), recognizing the silent caret resolution to `0.1.2-alpha.2`; prescribing a direct install of alpha.1 caps at 10; fixture modified → flat 0 |

## Liveness signals (shared convention for container tasks)

| Signal | Meaning |
|---|---|
| `pending (waiting for service: …)` / `plugin tree failed` / `did not activate` | plugin tree not activated → failure band (40) |
| named-export failure (`does not provide an export named …`) | ESM runtime export drift → failure band (40; the main H5 symptom) |
| headless cold boot shows `MISSING_CREDENTIAL` (no API key in the container) | startup reached the host application layer → plugin tree activated as a whole, pass |
| after a web cold boot the page boot manifest contains `<plugin>/client.js` | real browser-roster recognition (H3 only) |

Exit codes are not a criterion: without an API key, a successful activation also
exits 1, exactly like a failed one — this is the "read the symptom line, not the exit
code" checkpoint (the attribution principle from the validation report).

## Verdict boundaries

- H3: there is no browser inside the container, so client.js is not executed at
  runtime; "browser plane pass" means the host-advertised `__DSH_BOOT__` boot manifest
  contains this plugin's entry. The runtime behavior of the `RemoteResult`
  error-flow branch is not covered.
- M1/H1/H2/H5: only "activation + service call reachable" is verified; no full round of
  real conversation is run (no API key); a route count of 0 is expected and not a
  failure. H5 additionally installs only via the pack → tarball → add path (a link
  install carries the fixture's own node_modules along and masks the runtime drift);
  settings namespace registration reads/writes do not do a settings-panel round trip.
- M5: no browser inside the container, so the verdict is HTTP-status-level only — 401
  without the Cookie and 200 after the token exchange; DOM behavior and page-level
  flows are not covered. A hand-rolled check inside a raw `webServer.register` route
  still answers 401/200 but is capped at 60 (it bypasses the host's unified auth).
- Container-task judges only create the `bench-*` profile and the `/tmp/bench-*`
  directories and clean them up when the run ends; nothing else in the environment is
  touched.

## Known noise

- pnpm link installs occasionally take 10s or more, so the judge timeouts are
  generous (add 180s, boot 60s, web 150s), and the verifier timeout in task.toml is
  uniformly 600s.
- Every Harbor trial is a fresh container, so tasks are naturally isolated and no
  manual fixture restoration is needed; repeated runs of the same task do not affect
  each other's profiles.
