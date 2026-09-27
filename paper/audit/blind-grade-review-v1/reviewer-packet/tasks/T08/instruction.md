# S11 · Mermaid Lazy-Load Trap (Read-Only)

## Unattended Evaluation Authorization (BENCHMARK-AUTH-v1)

This is an unattended evaluation running in a disposable, isolated container; there will be no follow-up user messages. This task brief is itself the user's explicit authorization and confirmation for the approach and execution needed to complete the task: complete the necessary analysis and planning on your own, and keep executing as soon as the plan is formed — do not pause to wait for "confirmation", and do not ask the user follow-up questions. That confirmation continues to apply to the concrete plans you produce under the applicable skill, but only within the following scope:

- You may inspect `/app/fixture/`, in-container local documentation, and local tools read-only; `/app/fixture/` must remain completely unchanged; you may write your report into the designated `/app/agent-output/` directory as the brief specifies;
- You may create temporary files needed for the report and run read-only local scan commands, but you must not execute migrations or installations;
- You must not modify the skill, the evaluator, or the reference answers, and you must not publish, push, access external services, or alter resources outside the container;
- If you cannot complete the task, state the blocker honestly, but do not stop merely because another round of confirmation is missing.

I maintain the community Web plugin `@org/dsh-attach-input` (lib-only bundle). I just added
mermaid diagram rendering to its markdown reading mode as a **lazily-imported chunk** served by a
new host route, and the rollout has been a mess — three distinct incidents, in order:

1. **First attempt (split chunks)**: I let the bundler emit the mermaid chunk with its default
   code-splitting. The browser loaded my chunk file fine but then every per-diagram sibling
   import failed with "Failed to fetch dynamically imported module" (404s on files like
   `./pie-WAS4IAKB.js`).
2. **Second attempt (single file, new route)**: I bundled everything into ONE self-contained
   chunk and added a host prefix route serving my plugin's lib dir. On my Linux CI everything
   passes; on my **production Windows host** the browser console shows
   `GET /dsh-attach-input/resources/mermaid-chunk.js 403` and the diagram falls back to a
   plain code block. The route code is in the evidence pack.
3. **Zoom modal conflict**: after the diagrams finally rendered, users complained that
   Ctrl+scroll inside my new fullscreen zoom modal resizes BOTH the diagram and the pane's
   font size at the same time.

The evidence pack in `/app/fixture/` (read-only — do not modify it) has the host route source,
the console captures, and my CI note.

**Your report** (write to `/app/agent-output/S11-mermaid-lazyload-trap/`, any filename):

1. Incident 1: why the split-chunk approach failed — what breaks when a dynamically imported
   chunk has sibling imports, and what the build-side fix is;
2. Incident 2: the exact flaw in the route's containment guard that yields 403 on Windows while
   Linux passes — name the mechanism precisely (what each API returns on each platform), not
   just "Windows is different";
3. The fix direction for the guard (what comparison to use and why it is robust on both
   platforms), plus one other serving requirement the route must satisfy for a dynamic import
   to work at all;
4. Incident 3: why BOTH handlers fire on one Ctrl+scroll under the modal, and the ownership
   rule that fixes it;
5. The regression tests that would have caught incidents 1–3 before release.

What is tested: deriving each root cause from the evidence (bundler semantics, path/realpath
platform behavior, event-listener ordering) rather than platform folklore, and converting them
into concrete fixes plus regression coverage.
