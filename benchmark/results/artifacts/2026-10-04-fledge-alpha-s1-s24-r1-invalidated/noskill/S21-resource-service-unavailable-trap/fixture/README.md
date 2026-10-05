# Evidence pack — exam material only, do not modify

Read-only evidence from a real 2026-09-09 dsh 0.1.5-alpha.1 → 0.1.5-alpha.2 in-place
upgrade on Windows (npm global; profile created under 0.1.2/0.1.3 with six external
client plugins junction-linked). The report goes to /app/agent-output/<task-id>/.

| File | What it is |
|---|---|
| symptom-log.txt | the timeline: two distinct dialogs (absolute-scope claim error on alpha.1; session-scoped 内容读取失败 on alpha.2), the terminal output, the F12 observation |
| boot-manifest-excerpt.txt | the __DSH_BOOT__ roster excerpt: which sidebar/workspace-files modules the 0.1.5-alpha.2 host lists, and the ui-sidebar-textpreview absence (renamed in alpha.2) |
| combo-probe.txt | the per-module sweep (62/62 HTTP 200) plus the all-entries-joined probe (404) |
| contrast-probe.txt | two readers of the same file: file-trace's own RPC (works) vs the sidebar tab's read (never arrives) |
| console-excerpt.txt | the browser console: no documentpreview errors; only dsh-paste-input fold-skip warnings |
| discussion-excerpt.txt | the 0.1.5-alpha.1 round of the same failure family (discussion #5999) |
