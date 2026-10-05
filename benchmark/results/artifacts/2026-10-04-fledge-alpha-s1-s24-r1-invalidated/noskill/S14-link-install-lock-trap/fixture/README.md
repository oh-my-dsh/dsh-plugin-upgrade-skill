# S14 fixture · Link-install activation evidence pack (static)

Evidence for the S14-link-install-lock-trap task: a PowerShell session transcript showing a
failed Copy-Item into the plugin's profile node_modules, the filesystem introspection that
reveals what that profile entry actually is, and the maintainer's thread describing what
they changed and what the user saw. **Read-only fixture — do not execute or publish
anything here**; the task grading requires this directory to be unchanged relative to git HEAD.

- `copy-session.txt` — the EBUSY Copy-Item attempts (including one "rename aside then copy" recovery that made things worse)
- `profile-introspection.txt` — Get-Item LinkType/Target on the profile entry and the repo directory
- `maintainer-thread.md` — what was changed, where, and what the user reported after each step
