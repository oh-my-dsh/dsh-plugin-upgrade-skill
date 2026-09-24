# S17 fixture · External UI plugin onboarding incident evidence pack (static)

Evidence for the S17-external-ui-plugin-onboarding-trap task: the browser error from the
first failed boot, the offending plugin's client bundle as the user wrote it, the profile
patch rows that installed it, the second apply-time error after repackaging, the dev-loop
restart notes, a redacted excerpt of a WORKING plugin's client bundle for comparison, and
the host boot log. **Read-only fixture — do not execute or publish anything here**; the
task grading requires this directory to be unchanged relative to git HEAD.

- `browser-error.txt` — the browser-side failure on the first boot (note WHICH entry it names)
- `profile/cordis.patch.yml` — the profile patch rows that inserted the new plugin
- `plugin/lib/client.js` — the new plugin's client bundle exactly as the user wrote it
- `plugin-apply-error.txt` — the apply-time error on the SECOND boot (after repackaging)
- `working-plugin-excerpt.txt` — redacted excerpt of a WORKING plugin's client bundle
- `host-boot-log.txt` — host log fragments: what is assembled at boot, and when
- `restart-notes.txt` — the dev-loop restart observations (including the EADDRINUSE boot failure)
