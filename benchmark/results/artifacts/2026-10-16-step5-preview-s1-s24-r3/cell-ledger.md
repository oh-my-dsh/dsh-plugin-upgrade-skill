# Cell Ledger — step5-preview S1–S24 r2 (DSH in-session subagents, round 2)

| task | arm | status | start | end | duration | toolcalls | tokens |
|---|---|---|---|---|---|---|---|
| S1-static-scan | noskill | ok | 2026-10-16T07:30:14.018Z | 2026-10-16T07:36:47.172Z | 6m33s | 39 | 323834 |
| S1-static-scan | skill | ok | 2026-10-16T07:30:14.112Z | 2026-10-16T07:44:14.699Z | 14m01s | 35 | 1886240 |
| S2-negative-scan | noskill | ok | 2026-10-16T07:30:14.197Z | 2026-10-16T07:36:44.311Z | 6m30s | 22 | 308976 |
| S2-negative-scan | skill | ok | 2026-10-16T07:37:07.242Z | 2026-10-16T07:46:05.384Z | 8m58s | 73 | 1602301 |
| S3-snapshot-migration | noskill | ok | 2026-10-16T07:37:07.345Z | 2026-10-16T07:47:57.902Z | 10m51s | 11 | 394938 |
| S3-snapshot-migration | skill | ok | 2026-10-16T07:44:26.509Z | 2026-10-16T08:02:36.126Z | 18m10s | 83 | 2998667 |
| S4-legacy-client-imports | noskill | ok | 2026-10-16T07:46:26.750Z | 2026-10-16T07:51:56.313Z | 5m30s | 18 | 300514 |
| S4-legacy-client-imports | skill | ok | 2026-10-16T07:48:04.515Z | 2026-10-16T07:57:54.016Z | 9m50s | 43 | 1192061 |
| S5-negative-naming | noskill | ok | 2026-10-16T07:52:07.832Z | 2026-10-16T07:59:28.846Z | 7m21s | 20 | 312639 |
| S5-negative-naming | skill | invalid:roaming | 2026-10-16T07:58:11.612Z | 2026-10-16T08:04:27.870Z | 6m16s | 49 | 485006 |
| S6-corridor-net-state | noskill | ok | 2026-10-16T07:59:42.468Z | 2026-10-16T08:05:29.966Z | 5m47s | 14 | 192633 |
| S6-corridor-net-state | skill | ok | 2026-10-16T08:02:47.808Z | 2026-10-16T08:08:02.172Z | 5m14s | 16 | 609565 |
| S7-unpublished-cohort | noskill | ok | 2026-10-16T08:04:44.671Z | 2026-10-16T08:11:11.424Z | 6m27s | 12 | 100277 |
| S7-unpublished-cohort | skill | ok | 2026-10-16T08:06:41.778Z | 2026-10-16T08:16:20.585Z | 9m39s | 46 | 1248530 |
| S8-release-routing-trap | noskill | ok | 2026-10-16T08:08:16.629Z | 2026-10-16T08:15:16.102Z | 6m59s | 7 | 210678 |
| S8-release-routing-trap | skill | ok | 2026-10-16T08:16:34.645Z | 2026-10-16T08:39:22.558Z | 22m48s | 24 | 1489435 |
| S9-composer-coordinate-trap | noskill | ok | 2026-10-16T08:39:37.419Z | 2026-10-16T08:53:00.808Z | 13m23s | 30 | 882983 |
| S9-composer-coordinate-trap | skill | ok | 2026-10-16T08:53:16.582Z | 2026-10-16T09:04:00.837Z | 10m44s | 45 | 826115 |
| S10-paste-rename-and-version-chip | noskill | ok | 2026-10-16T09:04:02.905Z | 2026-10-16T09:10:28.662Z | 6m26s | 19 | 218998 |
| S10-paste-rename-and-version-chip | skill | ok | 2026-10-16T09:10:29.299Z | 2026-10-16T09:24:26.498Z | 13m57s | 34 | 2014231 |
| S11-mermaid-lazyload-trap | noskill | invalid:roaming | 2026-10-16T09:24:26.932Z | 2026-10-16T09:38:17.866Z | 13m51s | 15 | 725183 |
| S11-mermaid-lazyload-trap | skill | ok | 2026-10-16T09:38:44.043Z | 2026-10-16T09:50:40.433Z | 11m56s | 51 | 407159 |
| S12-global-upgrade-ebusy-trap | noskill | ok | 2026-10-16T09:50:45.265Z | 2026-10-16T09:56:29.847Z | 5m45s | 25 | 332081 |
| S12-global-upgrade-ebusy-trap | skill | ok | 2026-10-16T09:56:32.125Z | 2026-10-16T10:02:37.775Z | 6m06s | 28 | 536004 |
| S13-peer-range-vs-runtime | noskill | ok | 2026-10-16T10:02:52.756Z | 2026-10-16T10:10:13.137Z | 7m20s | 31 | 474608 |
| S13-peer-range-vs-runtime | skill | ok | 2026-10-16T10:10:22.318Z | 2026-10-16T10:14:38.283Z | 4m16s | 41 | 466063 |
| S14-link-install-lock-trap | noskill | ok | 2026-10-16T10:15:02.410Z | 2026-10-16T10:20:41.037Z | 5m39s | 7 | 202121 |
| S14-link-install-lock-trap | skill | ok | 2026-10-16T10:21:03.417Z | 2026-10-16T10:28:04.583Z | 7m01s | 16 | 720085 |
| S15-slot-error-boundary-crash | noskill | silent-failure | 2026-10-16T15:12:20.401Z | 2026-10-16T15:15:48.525Z | 0m25s | 0 | 0 |
| S15-slot-error-boundary-crash | skill | silent-failure | 2026-10-16T15:15:40.012Z | 2026-10-16T15:43:40.287Z | 0m46s | 5 | 29168 |
| S16-self-host-upgrade-trap | noskill | silent-failure | 2026-10-16T15:15:40.088Z | 2026-10-16T15:43:40.423Z | 0m46s | 7 | 29404 |
| S16-self-host-upgrade-trap | skill | relaunched | 2026-10-16T15:43:02.708Z | 2026-10-16T15:53:59.533Z | 8m39s | 40 | 809848 |
| S17-external-ui-plugin-onboarding-trap | noskill | ok | 2026-10-16T15:45:57.857Z | 2026-10-16T15:54:52.424Z | 8m55s | 20 | 203535 |
| S17-external-ui-plugin-onboarding-trap | skill | silent-failure | 2026-10-16T15:45:57.942Z | 2026-10-16T15:53:44.129Z | 2m00s | 19 | 101897 |
| S18-terminal-sprite-render-trap | noskill | silent-failure | 2026-10-16T15:54:25.687Z | 2026-10-16T15:55:39.955Z | 0m32s | 0 | 0 |
| S18-terminal-sprite-render-trap | skill | silent-failure | 2026-10-16T15:54:25.757Z | 2026-10-16T15:55:41.239Z | 0m33s | 0 | 0 |
| S19-phantom-update-stale-host | noskill | silent-failure | 2026-10-16T15:55:24.203Z | 2026-10-16T16:12:53.197Z | 10m10s | 22 | 297964 |
| S19-phantom-update-stale-host | skill | silent-failure | 2026-10-16T16:02:58.833Z | 2026-10-16T16:13:44.476Z | 10m23s | 22 | 1051217 |
| S20-msvc-flock-trap | noskill | ok | 2026-10-16T16:02:58.919Z | 2026-10-16T16:08:50.228Z | 5m51s | 15 | 220815 |
| S20-msvc-flock-trap | skill | silent-failure | 2026-10-16T16:09:41.046Z | 2026-10-16T16:13:44.006Z | 0m32s | 0 | 0 |
| S21-resource-service-unavailable-trap | noskill | silent-failure | 2026-10-16T16:13:27.810Z | 2026-10-16T16:22:57.847Z | 0m32s | 0 | 0 |
| S21-resource-service-unavailable-trap | skill | silent-failure | 2026-10-16T16:22:41.859Z | 2026-10-16T16:22:58.747Z | 0m17s | 0 | 0 |
| S22-duplicate-insert-boot-crash-trap | noskill | silent-failure | 2026-10-16T16:22:41.950Z | 2026-10-16T16:22:58.544Z | 0m17s | 0 | 0 |
| S22-duplicate-insert-boot-crash-trap | skill | pending | | | | | |
| S23-passing-compat-guard-trap | noskill | pending | | | | | |
| S23-passing-compat-guard-trap | skill | pending | | | | | |
| S24-dock-cotenant-crash-trap | noskill | pending | | | | | |
| S24-dock-cotenant-crash-trap | skill | pending | | | | | |

cells accounted: 43/48 (pending: 5)
