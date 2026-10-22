# S19 · The Phantom Update, the Stale Host Half, and the Corrupted Payload (Read-Only)

## Unattended Evaluation Authorization (BENCHMARK-AUTH-v1)

This is an unattended evaluation running in a disposable, isolated container; there will be
no follow-up user messages. This task brief is itself the user's explicit authorization and
confirmation for the approach and execution needed to complete the task: complete the
necessary analysis and planning on your own, and keep executing as soon as the plan is
formed — do not pause to wait for "confirmation", and do not ask the user follow-up
questions. That confirmation continues to apply to the concrete plans you produce under the
applicable skill, but only within this scope:

- You may inspect `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r2\skill\S19-phantom-update-stale-host\fixture\`, in-container local documentation, and local tools read-only; `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r2\skill\S19-phantom-update-stale-host\fixture\` must remain completely unchanged; you may write your report into the designated `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r2\skill\S19-phantom-update-stale-host\agent-output\` directory as the brief specifies;
- You may create temporary files needed for the report and run read-only local scan commands, but you must not execute migrations or installations;
- You must not modify the skill, the evaluator, or the reference answers, and you must not publish, push, access external services, or alter resources outside the container;
- If you cannot complete the task, state the blocker honestly, but do not stop merely because another round of confirmation is missing.

A maintainer just released v0.3.7 of a client-side plugin (a markdown renderer fix), and in
the same session shipped an SVG render-preview feature as v0.3.8. Afterwards three things
went wrong, captured in the evidence pack under `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r2\skill\S19-phantom-update-stale-host\fixture\` (read-only — do not modify
it):

1. the freshly released v0.3.7 shows its own update badge — "新版本 v0.3.7 可用" — the
   plugin is announcing an update to itself, although all three mirrors serve the new
   bundle and the tag SHA was verified on every mirror;
2. the v0.3.8 SVG render toggle DOES appear in the browser (the client half is refreshed),
   but Render fails: the host asset route answers 404 for the .svg while a PNG probe
   returns 200 — and the shipped `lib/index.js` whitelists `image/svg+xml`;
3. rendering one traced SVG through the session payload produces a broken image: the
   session log's read-result text for the file is corrupted (a mid-file line spliced with
   another line's tail at a shared prefix), while the source file on disk is well-formed
   XML, and a re-read comes back clean.

**Your report** (write to `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r2\skill\S19-phantom-update-stale-host\agent-output\S19-phantom-update-stale-host\`, any filename):

1. Phantom self-update root cause: why the released client announces an update to itself —
   where the compared version constant comes from (build time vs runtime), what the actual
   operation-order mistake was, why mirror/tag integrity is irrelevant here, and the
   corrected release order plus the check that would have caught the stale constant before
   pushing;
2. Client vs host plane update asymmetry: why the new client UI reached the browser while
   the new host route still 404s — where each half's code is loaded and when (client
   re-fetch/reload vs host boot-time route registration), how the probe results
   (PNG 200 / SVG 404 / disk lib whitelists svg) pin the staleness to the RUNNING host
   process rather than the release, and what makes a host-plane change effective (and why
   this is the one case where the usual "plugins hot-update" rule does not hold);
3. Broken-image attribution: given a well-formed source file, a spliced session-log
   payload, and a clean re-read — where the corruption happened (which layer produced the
   text), why the plugin must treat the session payload as untrusted rendering input, and
   why editing or "repairing" the traced file would have been the wrong move;
4. Defensive render chain: design the render-source order for an SVG preview — disk-bytes
   asset route first, session payload only after an XML well-formedness check
   (DOMParser/`parsererror`), a sandboxed iframe as the last render fallback (scripts
   blocked, SMIL animations still run), and an explicit error state instead of a silent
   broken image — and justify each level;
5. Forensics method + prevention: how the session log (a concatenated-Zstandard
   generation file) can be decoded frame-by-frame to recover the exact stored text, and
   the release-checklist items this incident adds (version-bump-before-build, grepping the
   shipped bundle for the baked constant, per-mirror tag SHA verification, and reporting
   the upstream text-corruption bug instead of papering over it in the plugin).

What is tested: attributing a self-referential update badge to a build-time version
constant and the bump-after-build order, separating client-plane refresh from host-plane
boot-time registration, attributing broken rendering to upstream session-payload
corruption instead of the traced file, designing a validated multi-source render chain,
and the session-log forensics that turns an anecdote into evidence.


WORKSPACE BOUNDARY (hard rule — you are running inside a benchmark harness):
The ONLY paths you may read, list, glob, grep, or open are:
  1. E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r2\skill\S19-phantom-update-stale-host\fixture\        (your task evidence)
  2. E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r2\skill\S19-phantom-update-stale-host\agent-output\   (write your report here)
  3. E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\ (read-only skill reference)
Every other path is FORBIDDEN — including but not limited to: the repository
root and any file there (README, docs, drafts), the benchmark/ directory
tree, solution/ and tests/ subdirectories, .dsh/, node_modules/, system
temporary directories (the Windows TEMP / %TEMP% / AppData\Local\Temp
directories), and anything outside the paths listed above. You MUST NOT
write to ANY path outside your own cell directory — not even a temporary
or scratch file. If you need a temporary script, write it inside
E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r2\skill\S19-phantom-update-stale-host\agent-output\S19-phantom-update-stale-host\ and delete it when you are done.
Do not list, glob, or open any parent or sibling directory even "just to
look". If something you need is missing from your allowed paths, state
that in your report instead of searching elsewhere.

You may additionally consult the plugin-upgrade skill (read-only) at `E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\`. You must not read the task's `solution/` or `tests/` directories.
