# Session event ledger — handover note

This plugin reads the session event log in exactly one place: the
`src/session-ledger.mjs` module. The rest of the plugin (projections, tools,
paging code) calls the five helpers below and nothing else. These five
contracts must keep holding after the migration.

1. `fullVisibleLog(session)` — the complete **visible** event log. "Visible"
   means everything this plugin can currently see, **including** the history
   this session inherited from its fork parent. Inherited history must not
   disappear from this helper.
2. `eventAtSeq(session, seq)` — the one event at an exact session sequence
   number, or `null` when the session has no such event (out of range or
   invalid position).
3. `windowFrom(session, fromSeq)` — the visible events at and after `fromSeq`,
   in log order, up to the current end of the log. The window is contiguous
   and must include the very last event.
4. `eventInWindow(session, fromSeq, seq)` — the event at `seq`, but only when
   that position lies inside the window at and after `fromSeq`; otherwise
   `null`. (Used by the paging code; today it is only ever called with
   `fromSeq = 0`, but the contract says any window.)
5. `ownOnlyEvents(session)` — only the events this session produced itself;
   the fork-inherited prefix is excluded. Inherited events must not leak into
   this helper.

## Version boundary

- The module was written against **dsh 0.1.2-alpha.3**.
- We are migrating the plugin to **dsh 0.1.2-alpha.4**, which is installed in
  this container as the exact published version. Its published sources and
  type declarations are under `node_modules/@deepseek-ai/dsh-session/` — that
  package is the first-party reference for what the alpha.4 session surface
  looks like.

Forked sessions are real here: the runtime distinguishes a session's own
events from the prefix it inherited from its parent, and the migration must
respect that distinction in exactly the two helpers where the contracts above
mention it.
