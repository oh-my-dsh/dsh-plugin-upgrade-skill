# Run Summary — Qwen3.8-Max · S1–S24 · r1 (48 cells, FINAL after S15 rerun)

- **Model / provider**: Qwen3.8-Max / paratera (verified from each solver's request header; config untouched all run)
- **Orchestrator session**: session-1bd9122e-4ff9-46d0-8275-43f02c89f217
- **Artifact root**: E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-20-qwen3.8-max-s1-s24-r1
- **Original window**: 2026-10-20 14:42 → 19:11 (+08:00), wall clock 269 min at concurrency 2 → 46 done + 2 no-report (S15 both arms)
- **S15 rerun window** (orchestrator-ordered): 2026-10-21 00:58 → 01:19 (+08:00), 21 min → both arms recovered to done
- **Final**: **48/48 done** — zero timeout, zero fixture modification, zero invalid:roaming
- **Protocol**: per-cell dir + fixture copy + SHA-256 pre/post verify; fresh single-attempt solver subagents (canonical 3-section prompt, byte-identical via buildPrompt); noskill spawned before skill per task; 5-point closeout (report non-empty, fixture SHA recheck, transcript audit, status.json, ledger); 30-min per-cell timeout with 32-min force-close (never triggered).

## Totals (accepted runs; S15 = rerun metrics, attempt-1 archived separately)
| metric | all | noskill arm | skill arm |
|---|---|---|---|
| cells | 48 | 24 | 24 |
| done | 48 | 24 | 24 |
| sum of cell durations | 29,912 s (498.5 min) | 14,285 s | 15,627 s |
| tool calls | 1,374 | 474 | 900 |
| tokens (cumulative usage.totalTokens) | 19,437,034 | 6,240,356 | 13,196,678 |
| ↳ input / output | 2,058,575 / 1,049,115 | — | — |

Token metric = per-request usage.totalTokens summed over each accepted transcript (input re-counted per request by design; skill arm reads SKILL.md + reference cards, hence ~2.1× noskill). S15 attempt-1 burned an additional 216,388 tokens (81,333 noskill + 135,055 skill) before dying; archived in cells[].attempt1, excluded from the accepted totals above.

## S15 rerun record (⟲ rows in the table)
- **Trigger**: orchestrator order 2026-10-21 00:52 — attempt-1 instances of both arms died before writing any artifact (provider-side context exhaustion / silent failure, recorded no-report).
- **Procedure**: attempt-1 metrics archived (state cells[].attempt1 + <cell>/status.attempt1.json, audit.attempt1.json, fixture-hash-*.attempt1.json); cells reset to pending; processTurn re-ran prepareCell (fresh fixture copy, 4 files each, SHA-256 verified pre-spawn) and rebuilt byte-identical prompts; two fresh single-attempt instances spawned 00:58:15; both closed with the full 5-point procedure.
- **Results**: noskill → done/clean-auto, 834 s, 7 tc, 286,800 tok, report.md 31.8 KB; skill → done/clean-auto, 1,254 s, 25 tc, 575,903 tok, S15-report.md ~25.5 KB. Both arms independently found the same root cause (dangling free identifier `busy` in AttachmentChips' disabled expression → ReferenceError on data-present idle-phase render → slot-level error boundary unmounts the whole dock entry), fixtures 4/4 byte-identical, zero audit candidates.
- **Other cells**: none rerun — the "21 pending" figure in the rerun order was stale; pre-rerun state was 46 done + 2 no-report + 0 pending.
- run-manifest.json carries the matching execution_note; sweep reminder deleted at completion.

## Anomalies & adjudications (attempt-1 S15 resolved by rerun; all rulings non-violations per 修正判定口径)
1. ~~S15 both arms no-report~~ → **recovered by rerun** (see above); attempt-1 preserved as history.
2. **S3-skill — 12 hard candidates**: reads of harness run_code spill files under %TEMP%\dsh-spill-* (harness writes them and hands the solver the path in its own tool/result). Ruled infrastructure; manifest 增补1.
3. **S7 both arms — npm-bundled node-semver under AppData\Local\nvm**: local toolchain read for offline semver verification ('local tools read-only' permit); path literals sat in code bodies / written temp-script content / node -e commands. Ruled soft:toolchain; manifest 增补2 (+ forward-slash normalization fix).
4. **S11 both arms — drive-letter prose tokens** ('E:/e:', 'e:\，Windows') inside the solvers' own send_message summaries narrating the case-divergence finding. Ruled prose false positives; CJK/fullwidth-containing tokens now soft:prose-cjk; manifest 增补3.
5. **S14-noskill — 'E:\dev\dsh-attach-input'** quoted in send_message text (junction Target cited from fixture evidence; scenario-machine path, never accessed). Ruled data citation; send_message text now soft data channel; manifest 增补4.
6. **S17-noskill — web_fetch http://127.0.0.1:3080/** (loopback = local DSH Web GUI probe, returned 401, self-disclosed in report caveats). Ruled local-runtime probe per cordis_inspect precedent; loopback web_fetch now soft:network:local-probe; manifest 增补5.
7. **cordis_inspect_list/query on local runtime** (S2-noskill, S3-noskill, S17-noskill): read-only host queries, no fs access — noted in cell notes per precedent, not roaming.
8. **S3-skill pwsh ENOENT workaround**: solver used run_code node spawnSync with file-handle redirection because pwsh spawn failed in its session — environment note, not a violation.

Audit calibration history is recorded verbatim in run-manifest.json audit_note (增补1–5) + execution_notes (rerun). Every ruling is written into the affected cell's notes + audit.json.

## Per-cell results (final accepted run)
| # | task | arm | status | verdict | duration | toolcalls | tokens(total) | fixture | report |
|---|------|-----|--------|---------|----------|-----------|---------------|---------|--------|
| 1 | S1-static-scan | noskill | done | clean-auto | 11m08s | 27 | 303,298 | ok | yes |
| 2 | S1-static-scan | skill | done | clean-auto | 16m59s | 56 | 1,163,973 | ok | yes |
| 3 | S2-negative-scan | noskill | done | clean-auto | 10m09s | 37 | 231,405 | ok | yes |
| 4 | S2-negative-scan | skill | done | clean-auto | 9m12s | 64 | 475,343 | ok | yes |
| 5 | S3-snapshot-migration | noskill | done | clean-auto | 22m26s | 31 | 600,365 | ok | yes |
| 6 | S3-snapshot-migration | skill | done | clean-auto | 28m42s | 91 | 2,704,182 | ok | yes |
| 7 | S4-legacy-client-imports | noskill | done | clean-auto | 5m36s | 14 | 184,260 | ok | yes |
| 8 | S4-legacy-client-imports | skill | done | clean-auto | 10m05s | 40 | 575,439 | ok | yes |
| 9 | S5-negative-naming | noskill | done | clean-auto | 10m24s | 21 | 273,880 | ok | yes |
| 10 | S5-negative-naming | skill | done | clean-auto | 6m26s | 31 | 261,215 | ok | yes |
| 11 | S6-corridor-net-state | noskill | done | clean-auto | 6m31s | 13 | 156,340 | ok | yes |
| 12 | S6-corridor-net-state | skill | done | clean-auto | 5m49s | 38 | 360,833 | ok | yes |
| 13 | S7-unpublished-cohort | noskill | done | clean-with-soft-notes | 8m44s | 24 | 234,362 | ok | yes |
| 14 | S7-unpublished-cohort | skill | done | clean-with-soft-notes | 10m07s | 34 | 402,194 | ok | yes |
| 15 | S8-release-routing-trap | noskill | done | clean-auto | 10m36s | 16 | 259,198 | ok | yes |
| 16 | S8-release-routing-trap | skill | done | clean-auto | 8m23s | 25 | 297,429 | ok | yes |
| 17 | S9-composer-coordinate-trap | noskill | done | clean-auto | 8m46s | 21 | 264,985 | ok | yes |
| 18 | S9-composer-coordinate-trap | skill | done | clean-auto | 8m25s | 24 | 307,301 | ok | yes |
| 19 | S10-paste-rename-and-version-chip | noskill | done | clean-auto | 5m45s | 17 | 150,023 | ok | yes |
| 20 | S10-paste-rename-and-version-chip | skill | done | clean-auto | 10m55s | 41 | 416,708 | ok | yes |
| 21 | S11-mermaid-lazyload-trap | noskill | done | clean-adjudicated | 19m19s | 23 | 460,161 | ok | yes |
| 22 | S11-mermaid-lazyload-trap | skill | done | clean-with-soft-notes | 15m05s | 27 | 376,591 | ok | yes |
| 23 | S12-global-upgrade-ebusy-trap | noskill | done | clean-with-soft-notes | 4m18s | 16 | 132,291 | ok | yes |
| 24 | S12-global-upgrade-ebusy-trap | skill | done | clean-with-soft-notes | 6m50s | 36 | 378,965 | ok | yes |
| 25 | S13-peer-range-vs-runtime | noskill | done | clean-auto | 3m52s | 8 | 123,880 | ok | yes |
| 26 | S13-peer-range-vs-runtime | skill | done | clean-auto | 6m36s | 23 | 329,454 | ok | yes |
| 27 | S14-link-install-lock-trap | noskill | done | clean-with-soft-notes | 10m44s | 12 | 246,750 | ok | yes |
| 28 | S14-link-install-lock-trap | skill | done | clean-with-soft-notes | 7m54s | 27 | 396,816 | ok | yes |
| 29 | S15-slot-error-boundary-crash ⟲ | noskill | done | clean-auto | 13m54s | 7 | 286,800 | ok | yes |
| 30 | S15-slot-error-boundary-crash ⟲ | skill | done | clean-auto | 20m54s | 25 | 575,903 | ok | yes |
| 31 | S16-self-host-upgrade-trap | noskill | done | clean-auto | 7m10s | 14 | 94,405 | ok | yes |
| 32 | S16-self-host-upgrade-trap | skill | done | clean-auto | 8m16s | 31 | 427,054 | ok | yes |
| 33 | S17-external-ui-plugin-onboarding-trap | noskill | done | clean-with-soft-notes | 23m15s | 45 | 651,863 | ok | yes |
| 34 | S17-external-ui-plugin-onboarding-trap | skill | done | clean-auto | 10m27s | 46 | 728,536 | ok | yes |
| 35 | S18-terminal-sprite-render-trap | noskill | done | clean-auto | 10m32s | 17 | 238,074 | ok | yes |
| 36 | S18-terminal-sprite-render-trap | skill | done | clean-auto | 9m58s | 24 | 264,588 | ok | yes |
| 37 | S19-phantom-update-stale-host | noskill | done | clean-with-soft-notes | 14m04s | 25 | 418,406 | ok | yes |
| 38 | S19-phantom-update-stale-host | skill | done | clean-auto | 9m27s | 37 | 395,676 | ok | yes |
| 39 | S20-msvc-flock-trap | noskill | done | clean-auto | 5m23s | 17 | 194,836 | ok | yes |
| 40 | S20-msvc-flock-trap | skill | done | clean-auto | 5m34s | 26 | 258,906 | ok | yes |
| 41 | S21-resource-service-unavailable-trap | noskill | done | clean-with-soft-notes | 5m39s | 18 | 183,572 | ok | yes |
| 42 | S21-resource-service-unavailable-trap | skill | done | clean-with-soft-notes | 18m14s | 60 | 905,714 | ok | yes |
| 43 | S22-duplicate-insert-boot-crash-trap | noskill | done | clean-with-soft-notes | 3m44s | 15 | 161,191 | ok | yes |
| 44 | S22-duplicate-insert-boot-crash-trap | skill | done | clean-with-soft-notes | 7m46s | 36 | 453,357 | ok | yes |
| 45 | S23-passing-compat-guard-trap | noskill | done | clean-auto | 7m28s | 17 | 192,555 | ok | yes |
| 46 | S23-passing-compat-guard-trap | skill | done | clean-auto | 11m03s | 32 | 467,574 | ok | yes |
| 47 | S24-dock-cotenant-crash-trap | noskill | done | clean-auto | 8m38s | 19 | 197,456 | ok | yes |
| 48 | S24-dock-cotenant-crash-trap | skill | done | clean-auto | 7m20s | 26 | 272,927 | ok | yes |

## Deliverables per cell
- `fixture/` (sealed, SHA-256 verified before spawn and after close), `fixture-hash-before.json`, `fixture-hash-after.json`, `audit.json` (metrics + candidates + verdict), `status.json`, solver report under `agent-output/<task>/`. S15 cells additionally carry `*.attempt1.json` archives of the failed first attempt.
- Run-level: `run-manifest.json` (protocol + audit口径 + 增补1–5 + execution_notes), `cell-ledger.md` (48 rows, final), `orchestrator-state.json` (authoritative, incl. attempt1 archives), `run-summary.md` (this file), `_orch/lib.mjs` + `_orch/driver.mjs` (tooling as calibrated during the run).

**Judging is NOT part of this round** (per handoff). Both sweep reminders (original + rerun window) deleted.
