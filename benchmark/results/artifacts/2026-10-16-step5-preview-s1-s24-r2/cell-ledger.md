# Cell Ledger — step5-preview S1–S24 r2 (DSH in-session subagents, round 2)

| task | arm | status | start | end | duration | toolcalls | tokens |
|---|---|---|---|---|---|---|---|
| S1-static-scan | noskill | ok | 2026-10-16T03:07:09.496Z | 2026-10-16T03:14:59.986Z | 7m50s | 27 | 240845 |
| S1-static-scan | skill | relaunched | 2026-10-16T03:07:09.616Z | 2026-10-16T03:25:05.448Z | 12m16s | 103 | 2055887 |
| S2-negative-scan | noskill | relaunched | 2026-10-16T03:07:09.737Z | 2026-10-16T03:20:52.938Z | 10m04s | 28 | 324642 |
| S2-negative-scan | skill | ok | 2026-10-16T03:16:24.657Z | 2026-10-16T03:30:04.567Z | 13m40s | 94 | 2761953 |
| S3-snapshot-migration | noskill | ok | 2026-10-16T03:30:41.676Z | 2026-10-16T03:40:41.483Z | 10m00s | 22 | 491849 |
| S3-snapshot-migration | skill | ok | 2026-10-16T03:30:41.766Z | 2026-10-16T03:46:24.875Z | 15m43s | 33 | 2295517 |
| S4-legacy-client-imports | noskill | ok | 2026-10-16T03:30:41.858Z | 2026-10-16T03:36:19.175Z | 5m37s | 26 | 225969 |
| S4-legacy-client-imports | skill | ok | 2026-10-16T03:36:34.419Z | 2026-10-16T03:44:41.661Z | 8m07s | 52 | 1355308 |
| S5-negative-naming | noskill | ok | 2026-10-16T03:41:24.561Z | 2026-10-16T03:46:02.576Z | 4m38s | 7 | 172032 |
| S5-negative-naming | skill | ok | 2026-10-16T03:45:03.211Z | 2026-10-16T03:52:59.860Z | 7m57s | 19 | 947581 |
| S6-corridor-net-state | noskill | ok | 2026-10-16T03:46:03.898Z | 2026-10-16T03:50:09.643Z | 4m06s | 9 | 202409 |
| S6-corridor-net-state | skill | ok | 2026-10-16T03:46:48.972Z | 2026-10-16T03:52:13.287Z | 5m24s | 20 | 849130 |
| S7-unpublished-cohort | noskill | ok | 2026-10-16T03:50:44.777Z | 2026-10-16T03:56:10.506Z | 5m26s | 15 | 207928 |
| S7-unpublished-cohort | skill | ok | 2026-10-16T03:52:21.909Z | 2026-10-16T04:03:51.624Z | 11m30s | 23 | 1426963 |
| S8-release-routing-trap | noskill | ok | 2026-10-16T03:53:52.959Z | 2026-10-16T04:00:36.809Z | 6m44s | 25 | 258519 |
| S8-release-routing-trap | skill | ok | 2026-10-16T03:56:21.441Z | 2026-10-16T04:05:24.675Z | 9m03s | 33 | 625648 |
| S9-composer-coordinate-trap | noskill | ok | 2026-10-16T04:00:46.940Z | 2026-10-16T04:13:45.319Z | 12m58s | 13 | 518858 |
| S9-composer-coordinate-trap | skill | ok | 2026-10-16T04:03:52.168Z | 2026-10-16T04:20:14.733Z | 16m23s | 34 | 1415847 |
| S10-paste-rename-and-version-chip | noskill | ok | 2026-10-16T04:05:34.380Z | 2026-10-16T04:13:33.164Z | 7m59s | 19 | 275843 |
| S10-paste-rename-and-version-chip | skill | ok | 2026-10-16T04:13:44.691Z | 2026-10-16T04:22:27.712Z | 8m43s | 38 | 460257 |
| S11-mermaid-lazyload-trap | noskill | ok | 2026-10-16T04:14:13.310Z | 2026-10-16T05:08:58.718Z | 54m45s | 34 | 596174 |
| S11-mermaid-lazyload-trap | skill | relaunched | 2026-10-16T04:20:26.479Z | 2026-10-16T05:27:40.318Z | 1h07m14s | 44 | 1327556 |
| S12-global-upgrade-ebusy-trap | noskill | ok | 2026-10-16T04:22:28.591Z | 2026-10-16T04:27:59.013Z | 5m30s | 9 | 220986 |
| S12-global-upgrade-ebusy-trap | skill | relaunched | 2026-10-16T04:28:14.390Z | 2026-10-16T05:19:53.439Z | 51m39s | 80 | 2276829 |
| S13-peer-range-vs-runtime | noskill | ok | 2026-10-16T05:10:21.509Z | 2026-10-16T05:15:55.453Z | 5m34s | 24 | 330917 |
| S13-peer-range-vs-runtime | skill | ok | 2026-10-16T05:19:13.605Z | 2026-10-16T05:25:23.839Z | 6m10s | 40 | 641567 |
| S14-link-install-lock-trap | noskill | ok | 2026-10-16T05:20:06.812Z | 2026-10-16T05:29:35.227Z | 9m28s | 8 | 275563 |
| S14-link-install-lock-trap | skill | ok | 2026-10-16T05:25:37.326Z | 2026-10-16T05:32:22.856Z | 6m46s | 17 | 523243 |
| S15-slot-error-boundary-crash | noskill | ok | 2026-10-16T05:27:53.385Z | 2026-10-16T05:36:03.280Z | 8m10s | 9 | 333811 |
| S15-slot-error-boundary-crash | skill | ok | 2026-10-16T05:29:37.087Z | 2026-10-16T05:44:38.250Z | 15m01s | 23 | 1253315 |
| S16-self-host-upgrade-trap | noskill | ok | 2026-10-16T05:32:27.138Z | 2026-10-16T05:38:50.703Z | 6m24s | 25 | 294920 |
| S16-self-host-upgrade-trap | skill | ok | 2026-10-16T05:36:18.799Z | 2026-10-16T05:41:18.405Z | 5m00s | 27 | 480182 |
| S17-external-ui-plugin-onboarding-trap | noskill | ok | 2026-10-16T05:39:06.079Z | 2026-10-16T05:45:55.521Z | 6m49s | 10 | 271136 |
| S17-external-ui-plugin-onboarding-trap | skill | ok | 2026-10-16T05:41:30.146Z | 2026-10-16T05:48:51.195Z | 7m21s | 23 | 1109191 |
| S18-terminal-sprite-render-trap | noskill | ok | 2026-10-16T05:44:40.581Z | 2026-10-16T05:53:08.101Z | 8m28s | 32 | 407854 |
| S18-terminal-sprite-render-trap | skill | relaunched | 2026-10-16T05:46:09.351Z | 2026-10-16T06:10:10.088Z | 23m48s | 29 | 904202 |
| S19-phantom-update-stale-host | noskill | ok | 2026-10-16T05:49:24.137Z | 2026-10-16T06:19:42.710Z | 30m19s | 86 | 4595181 |
| S19-phantom-update-stale-host | skill | ok | 2026-10-16T05:53:21.410Z | 2026-10-16T06:11:34.092Z | 18m13s | 41 | 2150679 |
| S20-msvc-flock-trap | noskill | ok | 2026-10-16T06:10:52.828Z | 2026-10-16T06:17:06.748Z | 6m14s | 32 | 233133 |
| S20-msvc-flock-trap | skill | ok | 2026-10-16T06:12:02.051Z | 2026-10-16T06:19:29.583Z | 7m28s | 20 | 873301 |
| S21-resource-service-unavailable-trap | noskill | ok | 2026-10-16T06:17:27.772Z | 2026-10-16T06:25:52.799Z | 8m25s | 13 | 228613 |
| S21-resource-service-unavailable-trap | skill | ok | 2026-10-16T06:19:42.887Z | 2026-10-16T06:26:28.513Z | 6m46s | 38 | 527863 |
| S22-duplicate-insert-boot-crash-trap | noskill | ok | 2026-10-16T06:19:43.011Z | 2026-10-16T06:24:00.784Z | 4m18s | 6 | 144257 |
| S22-duplicate-insert-boot-crash-trap | skill | ok | 2026-10-16T06:24:28.706Z | 2026-10-16T06:33:30.764Z | 9m02s | 61 | 1270736 |
| S23-passing-compat-guard-trap | noskill | ok | 2026-10-16T06:26:40.077Z | 2026-10-16T06:37:31.160Z | 10m51s | 33 | 487161 |
| S23-passing-compat-guard-trap | skill | ok | 2026-10-16T06:26:40.190Z | 2026-10-16T06:37:49.388Z | 11m09s | 41 | 787128 |
| S24-dock-cotenant-crash-trap | noskill | ok | 2026-10-16T06:33:46.841Z | 2026-10-16T06:42:57.499Z | 9m11s | 11 | 443538 |
| S24-dock-cotenant-crash-trap | skill | ok | 2026-10-16T06:37:45.604Z | 2026-10-16T06:45:28.490Z | 7m43s | 79 | 393863 |

cells accounted: 48/48 (pending: 0)
