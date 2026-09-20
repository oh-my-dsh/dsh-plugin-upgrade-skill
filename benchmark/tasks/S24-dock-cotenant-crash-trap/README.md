# S24 · The Dock That Vanished Together Trap

Static, read-only. A dsh in-place upgrade (0.1.6-alpha.1 → 0.1.6-alpha.2, npm global,
Windows, six junction-linked external client plugins) appears to break TWO plugins at
once: the session-progress strip is gone AND the paste/attachment plugin's chip rail
stops rendering — while the paste attach button (a different slot) survives.

Derived from a real 2026-09-17/18 session on this deployment. The trap has three layers:

1. exactly ONE plugin crashes — the strip destructures and unconditionally calls two
   seats (`useSessions`, `useSessionPendingInteraction`) removed from the dock's
   standard kit by the multi-instance refactor; the attachment plugin uses no
   standard-kit hooks at all;
2. the second "victim" is collateral damage: the dock is a list slot whose entries all
   mount under ONE shared error boundary, so the crashing strip unmounts the innocent
   co-tenant's chips entry with it (React boundary semantics), while the same plugin's
   button in a different slot survives — the symptom pattern invites debugging the
   wrong plugin (the maintainer reinstalled the innocent one);
3. the decisive evidence is a control experiment the maintainer already ran (disable
   the culprit → the victim recovers instantly), and the fix is graceful degradation
   that must never throw — a dock tenant that throws takes down its neighbors.

- Type: static / read-only report

- See `instruction.md` for the brief, `solution/report.md` for the reference answer.

## Semantic verifier

- **Scoring**: culprit attribution, experiment interpretation, degradation fix, multi-tenant hygiene, and verification: 20 each; a final recommendation to fix/rewrite only the innocent plugin (or to treat the two breakages as independent) caps at 40.
- **Boundary**: the separate verifier checks the complete fixture against sealed
  hashes; any edit, addition or deletion scores zero. Judge configuration, API, and
  the frozen statistics file live under `benchmark/report-judge/`; the packet seals
  the rubric and reference excerpts (generated — do not edit `tests/` by hand).
- **Card dependency**: references the DSH-0.1.6-A2-02 corridor card
  (`skills/plugin-upgrade/references/v0.1.6-alpha.2.md`, PR #248). The card names the
  removed seats; the co-tenant error-boundary mechanism, the experiment reading, and
  the never-throw rationale are NOT in the skill and must be derived from the fixture.
