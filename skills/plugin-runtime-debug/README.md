# plugin-runtime-debug

Diagnosing DSH Web plugin runtime bugs against host API contracts read from
the DSH source tree. Born from a real 2026-09-01 external-plugin incident
session (composer attachment insertion/removal failing after the first
attachment, a stale "latest version" chip, and phantom dock entries), kept
method-level on purpose: the skill names the questions and symptom families,
not the answers — the companion benchmark tasks
`benchmark/tasks/S9-composer-coordinate-trap/` and
`benchmark/tasks/S10-paste-rename-and-version-chip/` grade the concrete
diagnosis and the fix design.

- `SKILL.md` — the standing rule (read the verb's contract), four
  questions to ask any offset/span-taking or platform-dependent verb,
  symptom families, and the debug-to-release workflow.
- `references/browser-forensics.md` — driving the authenticated GUI in a
  headless browser over CDP (minting the session cookie from the local
  credential store), the safe temporary-instrumentation discipline for
  served client bundles, and the 2026-09 文件资源服务不可用 case study
  (URL hostname parsing of the non-special `dsh-resource://` scheme
  differing between browser engines).
