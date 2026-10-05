# Fixture · S23 evidence pack

Read-only evidence for a silent plugin failure after `dsh-v0.1.6-alpha.1 → dsh-v0.1.6-alpha.2`
(npm global, Windows, web profile with six external client plugins, junction-linked).

Files:

- `symptom-report.md` — the maintainer's bug report: Ctrl+Up/Down recall stopped working
  after the upgrade; no error, no banner, nothing in the console.
- `plugin/src-client-index.ts` — the input-recall plugin's client entry, including the
  compatibility guard it ships and the per-keystroke session resolution.
- `host-types/session-list-alpha1.d.ts` — the 0.1.6-alpha.1 session-controller type
  excerpt the plugin was written against.
- `host-types/session-list-alpha2.d.ts` — the same excerpt at 0.1.6-alpha.2.
- `host-types/ui-session-service-alpha2.d.ts` — a new service that ships in alpha.2's
  `@deepseek-ai/dsh-client-ui-session` client bundle.
- `upgrade-notes.txt` — release-notes excerpt, boot log excerpt, and the maintainer's
  already-tried list.

The plugin's own repository is NOT available; this pack is everything the maintainer
attached to the bug report.
