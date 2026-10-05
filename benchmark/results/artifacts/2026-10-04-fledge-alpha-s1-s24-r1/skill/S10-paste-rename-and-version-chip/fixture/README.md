# S10 fixture · Post-release follow-ups evidence pack (static)

Evidence for the S10-paste-rename-and-version-chip task: the plugin's attachment flow and
dock rendering excerpt, the self-update version-chip code, the two user threads, and one
captured HTTP response from the chip's tag check. **Read-only fixture — do not execute or
publish anything here**; the task grading requires this directory to be unchanged relative
to git HEAD.

- `plugin-attachment-flow.js` — add()/validateItems + the records alive-subscription + dock chip label
- `plugin-version-chip.js` — the tag fetch and the "already latest" chip rendering
- `user-threads.md` — follow-up A (unified renaming) and follow-up B (wrong latest) as filed
- `tags-api-response.txt` — the captured HTTP response minutes after pushing v0.2.11
