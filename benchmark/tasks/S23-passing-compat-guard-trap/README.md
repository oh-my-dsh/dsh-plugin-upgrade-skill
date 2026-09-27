# S23 · The Passing Compat Guard Trap

Static, read-only. A dsh in-place upgrade (0.1.6-alpha.1 → 0.1.6-alpha.2, npm global,
Windows, six junction-linked external client plugins) leaves one plugin silently dead: a
composer input-recall helper (Ctrl+Up / Ctrl+Down) stops responding with no error, no
warning, and — the trap's namesake — its own four-check compatibility guard reporting the
host as fully compatible.

Derived from a real 2026-09-17/18 session on this deployment. The trap has three layers:

1. the guard checks service-member presence (`sessions.list`, `sessions.scope`,
   `sessions.sessionOf`, `uiConversation.binding`) and every one of those survives the
   multi-instance refactor — what broke is a *field* inside the published snapshot:
   `SessionListState.current` is gone from alpha.2's `SessionListSnapshot`, so every
   keystroke's `resolve()` receives `undefined` and exits through the designed
   "no session open" quiet path;
2. the failure is a silent no-op by the plugin's own design — `current === undefined`
   previously meant a legitimate state, so it must not throw or banner, and the
   maintainer's evidence (clean console, passing guard) points nowhere;
3. the fix requires assembling a replacement read from sealed type evidence — the new
   `uiSession` service's `adapter.current` yields `{ key, ctx, … }` — plus a
   dual-host fallback and a guard that probes fields/behavior instead of service
   presence.

- Type: static / read-only report

- See `instruction.md` for the brief, `solution/report.md` for the reference answer.

## Semantic verifier

- **Scoring**: silent-break attribution, evidence mapping, dual-host migration recipe,
  guard hardening, and verification/prevention: 20 each; a final recommendation to fix
  the break by re-registering slots or merely re-declaring inject (the colleague's
  red herring) caps at 40.
- **Boundary**: the separate verifier checks the complete fixture against sealed
  hashes; any edit, addition or deletion scores zero. Judge configuration, API, and
  the frozen statistics file live under `benchmark/report-judge/`; the packet seals
  the rubric and reference excerpts (generated — do not edit `tests/` by hand).
- **Card dependency**: references the DSH-0.1.6-A2-01 corridor card
  (`skills/plugin-upgrade/references/v0.1.6-alpha.2.md`, PR #248). The card names the
  removed field and the replacement service; the silent-failure mechanism, the guard
  critique, and the dual-host recipe are NOT in the skill and must be derived from the
  fixture evidence.
