# Temporal holdout v1 — human-readable audit

Freeze: `5f7234ba4e00aeaa46c699ea32384389ad38a2a6` (2026-08-31T11:03:08+08:00) — frozen skill tree `817a48e6795b…`, SKILL.md blob `a3ee71d3567d…`.
Candidate inventory: `d4f7e8c229bfc9e9a4dc78efa290f954d39e42fe` (2026-09-04T17:00:57+08:00).
Selection was outcome-blind: no reward, activation, or model result was consulted.

| Task | First task commit | Core card(s) | Card first date | Knowledge at freeze | Class | Reason |
|---|---|---|---|---|---|---|
| H13-ghost-host-trap | ae4a0d43… (2026-09-02) | `DSH-0.1.2-A1-08` (supporting) before freeze (8eeb2bf0…) | `DSH-0.1.2-A1-08` (supporting) before freeze (8eeb2bf0…) | absent | clean-holdout | pre-flight step 1.5 ghost host: pin migration FROM to the running process wire generation (R-12, post-freeze); core knowledge authority is the post-freeze R-12 ghost-host recipe (idless rollup recipe), A1-08 cited only as the supporting auth-generation base |
| H20-session-events-ledger | 626a7b24… (2026-09-04) | `DSH-0.1.2-A4-03` after freeze (14756073…) | `DSH-0.1.2-A4-03` after freeze (14756073…) | absent | clean-holdout | alpha.4 removes Session.events; seq/eventAt/snapshotEvents/ownEvents ledger (A4-03, post-freeze #116) |
| H21-question-answerer-waterfall | dd0f3962… (2026-09-04) | `DSH-0.1.2-A1-20` after freeze (08483c92…) | `DSH-0.1.2-A1-20` after freeze (08483c92…) | absent | clean-holdout | structured-question answerer registration seam (A1-20, post-freeze) |
| H4-tsbuildinfo-trap | 728da545… (2026-08-31) | `DSH-0.1.2-A1-21` after freeze (08483c92…) | `DSH-0.1.2-A1-21` after freeze (08483c92…) | absent | clean-holdout | migration-hygiene build-cache false-positive discipline (migration-hygiene reference added post-freeze in 6686614; A1-21 not in frozen tree) |
| H7-locale-trap | a4cf488f… (2026-09-01) | — | — | absent | clean-holdout | display-text anchoring breaks after localization (R-13, post-freeze) |
| M13-repository-plugins-removal | 80faa20e… (2026-09-04) | `DSH-0.1.1-R1-01` after freeze (d7f451bb…) | `DSH-0.1.1-R1-01` after freeze (d7f451bb…) | absent | clean-holdout | rc.1 repository-plugins removal: dsh.bundle/dsh.client/exports + cordis.patch.yml insert (R1-01, post-freeze 2026-09-04) |
| M14-service-renames-0812 | 798e121e… (2026-09-04) | `DSH-0.1.1-R1-09` after freeze (d7f451bb…) | `DSH-0.1.1-R1-09` after freeze (d7f451bb…) | absent | clean-holdout | rc.1 service renames httpServer->webServer, tasks->jobs, onTaskDone->onJobDone (R1-09, post-freeze 2026-09-04) |
| M3-session-projection | a4cf488f… (2026-09-01) | `DSH-0.1.2-A2-08` after freeze (08483c92…) | `DSH-0.1.2-A2-08` after freeze (08483c92…) | absent | clean-holdout | missing inject service is a runtime pending (A2-08, post-freeze) |
| M4-peer-prerelease-range | a4cf488f… (2026-09-01) | — | — | absent | clean-holdout | npm semver prerelease rule: lower bound ^0.1.0-rc.8 does not match 0.1.2-alpha.2 (R-08 #3, post-freeze) |
| S8-release-routing-trap | aac651e3… (2026-09-01) | — | — | absent | clean-holdout | profile-dependency-management §8 version routing + §9 tag sync (real 2026-08-31 incident, distilled post-freeze in #90) |
| H10-browser-activation-trap | 232b00a2… (2026-09-01) | — | — | partial | mixed | post-freeze A1-26 (register id must equal package name) is the core trap, but A1-19 browser acceptance anchor is pre-freeze and present in the frozen corpus |
| H11-dual-cohort-rpc | 40885022… (2026-09-02) | — | — | partial | mixed | frozen R-02 already covers cross-cohort coexistence, but the graded rpc.handle arity/per-channel authority call shape came from the post-freeze dsh-mnemon incident; the task also pins its own closed-book snapshot 7d33bf4c (not the T2 freeze) |
| H14-mineru-api | 20c2c165… (2026-09-02) | — | — | partial | mixed | pre-freeze A1-01/A1-19 + post-freeze A1-25 (partial frozen precedent) |
| H15-locale-pack | 20c2c165… (2026-09-02) | — | — | partial | mixed | pre-freeze A1-10 + post-freeze A1-25 (partial frozen precedent) |
| H16-history-dock | 20c2c165… (2026-09-02) | — | — | partial | mixed | pre-freeze A1-03 + post-freeze A1-28 |
| H17-merge-calls | 20c2c165… (2026-09-02) | — | — | partial | mixed | pre-freeze A1-03 + post-freeze A1-29 |
| H18-blame-bubbles | 20c2c165… (2026-09-02) | — | — | partial | mixed | pre-freeze A1-01 + post-freeze A1-25/A2-08 |
| H19-workspace-ya | 20c2c165… (2026-09-02) | — | — | partial | mixed | pre-freeze A1-03 + post-freeze A1-25 (partial frozen precedent) |
| H5-runtime-export-drift | 23942ebe… (2026-08-31) | — | — | partial | mixed | post-freeze A2-10/R-11 framing, but the frozen api-migration reference already carries the exact settingsNamespace removal recipe (TS2305 / no exported member -> string literal); core API fact present at freeze |
| H9-dsh-web-alpha2 | 32b766ab… (2026-09-01) | — | — | partial | mixed | cites pre-freeze A2-02/A2-03 and post-freeze A2-10; core is a real-repository v0.3.8->v0.3.9 slice whose version-specific migration facts did not exist at freeze |
| M10-tools-tree | 20c2c165… (2026-09-02) | — | — | partial | mixed | A1-25 is the cited card, but the frozen example 01 already walks the client-runtime import rehome, so the graded knowledge is only partially absent |
| M11-sidebar-spur | 20c2c165… (2026-09-02) | — | — | partial | mixed | A1-25 cited; frozen example 01 partially covers the client-runtime split |
| M12-interpreters-card | 20c2c165… (2026-09-02) | — | — | partial | mixed | A1-25 cited; frozen example 01 partially covers the client-runtime split; store-move specifics post-freeze |
| M7-d399-overlay | 20c2c165… (2026-09-02) | — | — | partial | mixed | pre-freeze A1-19 + post-freeze A1-25 (client-runtime axis partially covered by the frozen example 01) |
| M8-brand-text | 20c2c165… (2026-09-02) | — | — | partial | mixed | post-freeze A1-25 (partial frozen precedent) + pre-freeze R-06 baseline attribution |
| M9-mcpanel | 20c2c165… (2026-09-02) | — | — | partial | mixed | pre-freeze A1-19 + post-freeze A1-25 (partial frozen precedent) |
| S4-legacy-client-imports | 91fb56bb… (2026-08-31) | — | — | partial | mixed | A1-26/A1-27/A1-30 are post-freeze and absent at freeze, but the A1-25 client-runtime removal axis has a pre-freeze walkthrough in frozen examples/01-simple-client-plugin.md |
| H1-plane-trap | b09d5d8a… (2026-08-31) | — | — | present | ineligible | core card A1-01 present at freeze |
| H12-remote-result-boundary-trap | 851b4439… (2026-09-02) | `DSH-0.1.2-A2-02` before freeze (8eeb2bf0…) | `DSH-0.1.2-A2-02` before freeze (8eeb2bf0…) | present | ineligible | frozen A2-02 and the frozen rollup Remote-error-flow section already contain the resolved-vs-rejected boundary recipe (the task core); task identity note: historical H11-remote-result-boundary-trap, merged to main directly as H12 |
| H2-baseline-trap | b09d5d8a… (2026-08-31) | — | — | present | ineligible | core R-06 baseline attribution present in the frozen rollup |
| H22-dsh-data-agent-alpha2 | 68b2d2d0… (2026-09-04) | — | — | n/a (other corpus) | ineligible | core is a real external project slice (dsh-data-agent v0.1.3->v0.1.4) plus pre-freeze A1-19; provenance is external |
| H3-client-plane | b09d5d8a… (2026-08-31) | — | — | present | ineligible | core cards A1-01/A1-19/A2-02 present at freeze |
| H6-remote-error-trap | 91fb56bb… (2026-08-31) | — | — | present | ineligible | frozen A2-02 already carries namespaced codes, no-retry, and no-silent-swallow recipes |
| H8-fire-drill | a49e814a… (2026-09-01) | — | — | present | ineligible | core cards A1-01/A1-08 and R-01 present at freeze |
| M1-host-migration | b09d5d8a… (2026-08-31) | — | — | present | ineligible | core card A1-01 present at freeze |
| M2-optional-dep-trap | a4cf488f… (2026-09-01) | — | — | present | ineligible | core card A2-03 present at freeze |
| M5-token-auth-smoke | a49e814a… (2026-09-01) | — | — | present | ineligible | core card A1-08 present at freeze |
| M6-sleep-tool | 20c2c165… (2026-09-02) | — | — | present | ineligible | core card A2-03 present at freeze |
| S1-static-scan | b09d5d8a… (2026-08-31) | — | — | present | ineligible | core cards A1-01/A1-02/A1-03/A1-04/A1-08/A2-01 present at freeze |
| S10-paste-rename-and-version-chip | 7d33bf4c… (2026-09-02) | — | — | n/a (other corpus) | ineligible | knowledge authority is the plugin-runtime-debug skill, not the frozen plugin-upgrade corpus |
| S11-mermaid-lazyload-trap | 70f003e7… (2026-09-02) | — | — | n/a (other corpus) | ineligible | knowledge authority is the plugin-heavy-dep skill, not the frozen plugin-upgrade corpus |
| S12-global-upgrade-ebusy-trap | fc5ca9d9… (2026-09-04) | — | — | n/a (other corpus) | ineligible | no carded knowledge authority in skills/plugin-upgrade (real 2026-09-02 incident, uncarded); provenance insufficient |
| S13-peer-range-vs-runtime | fc5ca9d9… (2026-09-04) | — | — | n/a (other corpus) | ineligible | no carded knowledge authority (real 2026-09-02 incident, uncarded); provenance insufficient |
| S14-link-install-lock-trap | 5419f337… (2026-09-04) | — | — | n/a (other corpus) | ineligible | knowledge authority is the plugin-runtime-debug skill, not the frozen plugin-upgrade corpus |
| S15-slot-error-boundary-crash | 5419f337… (2026-09-04) | — | — | n/a (other corpus) | ineligible | knowledge authority is the plugin-runtime-debug skill, not the frozen plugin-upgrade corpus |
| S16-self-host-upgrade-trap | 6d8466c0… (2026-09-04) | — | — | n/a (other corpus) | ineligible | real 2026-09-03 incident; no carded knowledge found in skills/plugin-upgrade; provenance insufficient |
| S2-negative-scan | b09d5d8a… (2026-08-31) | — | — | present | ineligible | core card A1-01 present at freeze |
| S3-snapshot-migration | 728da545… (2026-08-31) | — | — | present | ineligible | core card A1-03 present at freeze |
| S5-negative-naming | 91fb56bb… (2026-08-31) | — | — | n/a (other corpus) | ineligible | knowledge authority is the plugin-write skill, not the frozen plugin-upgrade corpus |
| S6-corridor-net-state | 91fb56bb… (2026-08-31) | — | — | present | ineligible | core cards A1-02/A2-01 present at freeze |
| S7-unpublished-cohort | 91fb56bb… (2026-08-31) | — | — | present | ineligible | core R-01 unpublished-cohort recipe present in the frozen rollup |
| S9-composer-coordinate-trap | 7d33bf4c… (2026-09-02) | — | — | n/a (other corpus) | ineligible | knowledge authority is the plugin-runtime-debug skill, not the frozen plugin-upgrade corpus |

Primary clean holdout set: **10 tasks** — H13-ghost-host-trap, H20-session-events-ledger, H21-question-answerer-waterfall, H4-tsbuildinfo-trap, H7-locale-trap, M13-repository-plugins-removal, M14-service-renames-0812, M3-session-projection, M4-peer-prerelease-range, S8-release-routing-trap.
Mixed: **17 tasks** — H10-browser-activation-trap, H11-dual-cohort-rpc, H14-mineru-api, H15-locale-pack, H16-history-dock, H17-merge-calls, H18-blame-bubbles, H19-workspace-ya, H5-runtime-export-drift, H9-dsh-web-alpha2, M10-tools-tree, M11-sidebar-spur, M12-interpreters-card, M7-d399-overlay, M8-brand-text, M9-mcpanel, S4-legacy-client-imports.
Ineligible: **25 tasks** — H1-plane-trap, H12-remote-result-boundary-trap, H2-baseline-trap, H22-dsh-data-agent-alpha2, H3-client-plane, H6-remote-error-trap, H8-fire-drill, M1-host-migration, M2-optional-dep-trap, M5-token-auth-smoke, M6-sleep-tool, S1-static-scan, S10-paste-rename-and-version-chip, S11-mermaid-lazyload-trap, S12-global-upgrade-ebusy-trap, S13-peer-range-vs-runtime, S14-link-install-lock-trap, S15-slot-error-boundary-crash, S16-self-host-upgrade-trap, S2-negative-scan, S3-snapshot-migration, S5-negative-naming, S6-corridor-net-state, S7-unpublished-cohort, S9-composer-coordinate-trap.

See `benchmark/holdouts/README.md` for the full eligibility policy and the
JSON definition for machine-readable provenance.
