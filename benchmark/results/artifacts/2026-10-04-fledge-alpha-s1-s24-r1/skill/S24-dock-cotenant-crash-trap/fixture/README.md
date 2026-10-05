# Fixture · S24 evidence pack

Read-only evidence for a two-symptom plugin failure after
`dsh-v0.1.6-alpha.1 → dsh-v0.1.6-alpha.2` (npm global, Windows, web profile, six
junction-linked external client plugins).

Files:

- `symptom-report.md` — the maintainer's bug report: the session-progress strip is
  gone AND paste attachments no longer display their chips; the paste attach BUTTON
  still renders.
- `console-excerpt.txt` — the single render error F12 shows, and what React did
  after it.
- `tried-notes.txt` — what the maintainer already tried, including the experiment
  whose result is the key evidence.
- `plugin-a/SessionProgressBar-excerpt.tsx` — the progress strip's component
  (plugin A, the session-progress plugin).
- `plugin-b/dock-entry-excerpt.md` — the attachment plugin's dock registration
  (plugin B, the paste/attachment plugin).
- `host-types/slots-contract-alpha1.d.ts` — the input-dock slot's standard props
  at 0.1.6-alpha.1.
- `host-types/slots-contract-alpha2.d.ts` — the same contract at 0.1.6-alpha.2.
- `host-types/dock-render-tree.md` — the shell's mount tree for the composer
  slots (dock list and neighbouring composer controls).

Both plugins' full repositories are NOT available; this pack is what the maintainer
attached to the bug report.
