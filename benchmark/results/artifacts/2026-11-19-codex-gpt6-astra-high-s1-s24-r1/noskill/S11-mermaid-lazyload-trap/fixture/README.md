# S11 fixture · Lazy-chunk rollout evidence pack (static)

Evidence for the S11-mermaid-lazyload-trap diagnosis task: the host chunk-route source (the
second attempt), the two console captures (split-chunk attempt and the Windows 403), and the
maintainer's CI note. **Read-only fixture — do not execute or publish anything here**; the task
grading requires this directory to be unchanged relative to git HEAD.

- `chunk-route.ts` — the host prefix route serving the plugin's lib dir (attempt 2)
- `console-split-chunks.txt` — attempt 1: sibling import 404s
- `console-403-windows.txt` — attempt 2: 403 on the Windows production host
- `ci-note.md` — what passes where
