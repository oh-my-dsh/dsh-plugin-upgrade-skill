# S9 fixture · Runtime-contract evidence pack (static)

Evidence for the S9-composer-coordinate-trap diagnosis task: the plugin's client-code
excerpt (insert + remove paths and the dock chip rendering), a captured browser session
log, and the two host source files the plugin calls into (the input facade verbs and the
published contract types). **Read-only fixture — do not execute or publish anything here**;
the task grading requires this directory to be unchanged relative to git HEAD.

- `plugin-client.js` — the community plugin's attachment flow (anonymized excerpt)
- `console-session.txt` — the reproduction capture: paste #1 ok, paste #2 toast, × click
- `host-input-facade.ts` — the host verbs' guards (trimmed from the DSH input facade)
- `host-input-contract.ts` — the published input state / occurrence / projection types
