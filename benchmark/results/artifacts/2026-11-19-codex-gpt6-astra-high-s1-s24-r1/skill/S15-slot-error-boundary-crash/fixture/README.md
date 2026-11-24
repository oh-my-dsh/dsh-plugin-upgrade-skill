# S15 fixture · Vanishing dock chips evidence pack (static)

Evidence for the S15-slot-error-boundary-crash task: the plugin's dock-chip component and
the attach button it sits next to, the feature diff that first exercised the crash path,
and the user thread reporting the symptom. **Read-only fixture — do not execute or publish
anything here**; the task grading requires this directory to be unchanged relative to git
HEAD.

- `plugin-dock-chips.js` — the dock chip component (AttachmentChips) and the attach button (AttachButton) as shipped in v0.2.10
- `feature.diff` — the v0.2.11 hover-preview diff that touched the same component and exposed the crash
- `user-thread.md` — what the user saw after updating to v0.2.11
