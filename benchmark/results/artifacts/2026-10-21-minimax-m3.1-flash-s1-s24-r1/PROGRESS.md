# S-Series Benchmark — MiniMax-M3.1-Flash — S1..S24 × {noskill, skill}

**Status: COMPLETE** — 48/48 cells, 24/24 arm pairs, 0 missing.

| metric | value |
|---|---|
| cells | 48 (24 tasks × 2 arms) |
| clean | 47 |
| invalid / anomaly | 1 (S1 noskill) |
| total tool calls | 1,983 |
| total tokens | 59,097,302 |
| summed wall time | 569 min (9 h 29 min) |
| noskill | 24 cells · 12,036,567 tok · 834 calls · 237 min · avg 591 s |
| skill | 24 cells · 47,060,735 tok · 1,149 calls · 332 min · avg 831 s |
| arm ratio | **3.91× tokens · 1.40× time** |
| cell duration | min 118 s · median 629 s · max 3,272 s |
| report size | min 12,962 B · median 30,924 B · max 52,275 B |
| fixture integrity | 48/48 byte-identical to pre-run seal |

## Per-cell results

| task | noskill (status / dur / tokens) | skill (status / dur / tokens) |
|---|---|---|
| S1-static-scan | **TIMEOUT/INVALID** 3272s 3258k | ok 1239s 5898k |
| S2-negative-scan | ok 683s 484k | ok 1087s 4025k |
| S3-snapshot-migration | ok 586s 497k | ok 957s 3604k |
| S4-legacy-client-imports | ok 418s 518k | ok 983s 2968k |
| S5-negative-naming | ok 172s 194k | ok 625s 1437k |
| S6-corridor-net-state | ok 121s 173k | ok 293s 1630k |
| S7-unpublished-cohort | ok 764s 910k | ok 1241s 2984k |
| S8-release-routing-trap | ok 361s 233k | ok 984s 1271k |
| S9-composer-coordinate-trap | ok 453s 435k | ok 1412s 833k |
| S10-paste-rename-and-version-chip | ok 304s 357k | ok 743s 1660k |
| S11-mermaid-lazyload-trap | ok 755s 484k | ok 1145s 1323k |
| S12-global-upgrade-ebusy-trap | ok 235s 255k | ok 564s 1499k |
| S13-peer-range-vs-runtime | ok 262s 250k | ok 327s 1033k |
| S14-link-install-lock-trap | ok 377s 343k | ok 601s 1249k |
| S15-slot-error-boundary-crash | ok 629s 254k | ok 1157s 1185k |
| S16-self-host-upgrade-trap | ok 443s 329k | ok 267s 1409k |
| S17-external-ui-plugin-onboarding-trap | ok 581s 215k | ok 679s 2906k |
| S18-terminal-sprite-render-trap | ok 720s 536k | ok 1012s 858k |
| S19-phantom-update-stale-host | ok 840s 825k | ok 905s 2233k |
| S20-msvc-flock-trap | ok 202s 159k | ok 290s 789k |
| S21-resource-service-unavailable-trap | ok 402s 354k | ok 982s 829k |
| S22-duplicate-insert-boot-crash-trap | ok 118s 164k | ok 408s 1362k |
| S23-passing-compat-guard-trap | ok 1066s 443k | ok 1128s 2644k |
| S24-dock-cotenant-crash-trap | ok 429s 367k | ok 903s 1434k |

## The one anomaly

**S1-static-scan / noskill** — `timeout [timeout:30min-cap-exceeded, invalid:no-report, invalid:roaming, invalid:loop]`

- 3,272 s vs the 1,800 s cap; 344 calls; 3,257,676 tokens; no report written.
- **Loop**: 273 ptc-dispatch over 72 steps; 158 read dispatches over only 11 unique operands — 150 redundant (6 fixture files × 25) forming a 6-file cycle repeated 23×.
- **Host probing**: 78 real exec probes (29 `dsh --dump-config`, 27 `--dump-config-schema`, 69 `cordis_inspect_*`) plus 62 quoted mentions that were correctly not counted.
- **Roaming**: 1 real out-of-whitelist read — `pwsh` read `C:\Users\lhh\AppData\Local\nvm\v24.18.1\node_modules\@deepseek-ai\dsh\package.json` (0.2.1-rc.1).
- Interrupted at "All evidence is gathered and cross-verified. Now let me write the report."
- **This cell ran under the original prompt.** After the boundary/loop rules were hardened, **all 47 subsequent cells were clean** — including every later noskill cell of the same shape. The anomaly is a property of the first cell under the initial prompt, not of the noskill arm.

## Two harness rescues (write-mechanics failures, not diagnostic failures)

1. **S23 noskill** — the agent completed ~180 K chars of analysis over two reasoning blocks, then exhausted its context before writing the report (11 tool calls, 0 report bytes). Resumed via `send_message` with instructions to write from the existing analysis without re-reading the fixture; it wrote the 448-line report in one `write` call. Final: **ok**.
2. **S24 noskill** — a duplicate spawn put two live agents in one cell directory (the 8-child limit made a refill pass skip a cell silently). Both wrote the same path. The completed agent (429 lines, 38,572 B) was kept and the duplicate interrupted; the audit is pinned to the completed session. Final: **ok**.

Neither cell's analysis was incomplete; only delivery failed.

## Headline finding: the arms differ in grounding, not in diagnosis

Across all 24 pairs the two arms reached **the same root cause in every pair**. Neither arm produced a root cause the other had to correct. The differences are additive **in both directions**:

**What the skill arm adds** — versioned grounding and standing gates:
- cites the governing card ID (S16: DSH-0.1.5-A1-20; S22: 11 refs including R-10 and API-08) and the release artifact that introduced the defect
- separates a **fatal** failure mode from a non-fatal sibling (S21: A2-14 explains the *shape* of the failure, A2-02 *exonerates* the confinement hypothesis)
- converts a one-off fix into a **standing gate** — lint forbidding `startsWith` containment (S16), link-vs-copied pre-flight (S14), manifest-completeness check (S18), frozen-lockfile CI (S20), content-based verification (S14)
- names its own **coverage gap** (S18: no card covers half-block rendering or timer liveness — cited as contract analogues, refused to force-fit)
- states **evidence strength** — INFERRED vs documented, and what a live boot would be needed to settle

**What the noskill arm adds** — empirical verification of its own methods and ownership reasoning:
- **S19**: measured the zstd multi-frame decode trap on three independent implementations (Node 24 `zlib.zstdDecompressSync` → 78 B, Node streaming → frame 0 only, Python `zstandard.decompress` → 78 B, no exception) and specified the method contract (`decompressobj()` + `unused_data`, magic-scan fallback that accepts only clean decodes)
- **S18**: built a renderer replica plus an SGR-interpreting screen buffer and confirmed the leak is *background* by construction
- **S15**: ran the phase sweep first-hand against the shipped v0.2.10 code and proved the hand-written diff's `-` side is not evidence of what shipped
- **S21**: named the single capture that settles the client-vs-host branch, and observed that a clean F12 is an *observability gap*, not a clearance
- **S19/S24**: ownership reasoning — the file is source of truth and the transport is defective; a plugin's crash in a shared slot is a co-tenant DoS

**Cost**: the skill arm costs **3.91× tokens** for **1.40× time**. The per-pair token ratio ranges from 1.6× (S18) to 13.5× (S17).

## Standing methodological findings

- **Served ≠ registered** (S21): HTTP 200 on every module never was the broken part; the joined-URL probe was an invalid measurement and pointing at it would misdirect triage.
- **Presence checks certify the door, not the field inside** (S23): a 4-member service guard passes while a three-level value break (service → returned value → field) silently no-ops. Error direction is a false negative.
- **"No console error" has false negatives** (S24): a shared-slot error boundary unmounts a healthy co-tenant and logs *unmounted*, not *crashed*.
- **A whole-buffer zstd decode of a concatenated-frame log returns only the first frame, silently** (S19, and independently found by both arms).
- **The maintainer's own comment can be true and its conclusion wrong** (S22): "if the bundle already contains this row it is redundant" — the premise held, the conclusion did not, because a duplicate is fatal rather than redundant.
- Both arms independently flagged the same **fixture-internal transcription slip** (S19: prose says the tail starts `"0 0,1"`, the literal payload and the XML error both say `"0,1"`) and both treated the literal as authoritative.

## Artifact root

`E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-minimax-m3.1-flash-s1-s24-r1`

- `run-manifest.json` — model, timing, config, limits, 8 audit/tooling changes, summary, rescue notes
- `cell-ledger.md` — 48 rows (one per task::arm, upserted)
- `run-state.json` — per-cell records + 16 `armComparison` blocks
- `PROGRESS.md`, `RESUME.md`
- `<arm>/<task>/agent-output/<task>/*.md` — the 47 reports
