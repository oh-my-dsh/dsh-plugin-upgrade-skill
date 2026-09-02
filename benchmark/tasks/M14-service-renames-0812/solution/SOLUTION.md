# M14 Reference Solution

## Reference Changes

See [solution/plugin/](plugin/); expected judge score: 100.

1. `lib/index.mjs` (the Node half — the packed artifact that `main` points at):
   rename every pre-0812 service identifier to the alpha.2 name, exactly the
   DSH-0.1.1-R1-09 migration recipe (`httpServer`→`webServer`,
   `tasks`→`jobs`, `onTaskDone`→`onJobDone`):
   - `inject` becomes `['jobs', 'webServer']` — both old names are gone, so there
     is no `pending (waiting for services: tasks, httpServer)` at boot;
   - `ctx.tasks.list()` becomes `ctx.jobs.list()` (the live read inside the route
     handler, so the payload's `open` count comes from the renamed registry);
   - `ctx.httpServer.register(...)` becomes `ctx.webServer.register(...)` — the
     registration interface keeps its shape (exact route, same path, same JSON
     payload; the recipe says do not rewrite unrelated code);
   - the `onTaskDone` listener becomes `jobs.onJobDone(listener)` (alpha.2:
     `ctx.jobs.onJobDone(...)`, verified in `@deepseek-ai/dsh-jobs-local`).
   - Comments are renamed too: the fixture's trap comments claimed the old names
     are "official — do not rename"; the reference keeps only comments that use
     the new identifiers.
2. `package.json` / `cordis.patch.yml`: unchanged — the bundle shape and the
   insert row are unaffected by the rename (matching the real 0812 commits, which
   touched only source/lib files: whale-girl 183354b was one file; dsh-loop
   c5bf083 source + packed lib; dsh-task-status 2b41273 source + lib;
   plugin-registry console 27aed06 source + lib).

## The Point (in one sentence)

DSH-0.1.1-R1-09: on 0812 the host renamed `httpServer`→`webServer`,
`tasks`→`jobs`, `onTaskDone`→`onJobDone` — a high-frequency, low-diff breaking
change (four repositories, one root cause) — so a plugin that still injects /
calls / listens on the old names sits at `pending (waiting for services: tasks,
httpServer)` on 0.1.2-alpha.2, and the fix is a pure identifier rename that
keeps `webServer.register`'s route shape and payload intact.

## Grading Boundary (important)

- There is no browser in this container and this task has no client half, so no
  client/runtime behavior is graded; the anchors are host-side only: the cold-boot
  log (negative signal vs `dsh web:`), and an HTTP route smoke
  (`GET /bench-status/status` → 200 with `{"ok":true}`).
- The judge sweeps the single Node entry file (`package.json` `main` →
  `lib/index.mjs`) for the old identifiers, code **and comments** — the fixture's
  trap comments count as leftovers, so the reference solution deliberately avoids
  the retired identifiers even in comments (a comment saying "the old web carrier
  name is gone" would false-hit the sweep and lose 10 points).
- There is no separate `src/` build tree in this task: the fixture's Node half IS
  the packed artifact (`main → lib/`, like dsh-loop), so "grep the packed
  artifact" and "grep the source" coincide; a two-tree (src + lib) coverage is
  deliberately out of scope (note for scoring.md).
- The event listener fires only during real runtime, which the container cannot
  exercise without a live job; `onJobDone` presence is graded statically, and the
  half-migrated state (`jobs` injected but `onTaskDone` still called) is a
  verified runtime failure on alpha.2 (`jobs.onTaskDone is not a function` →
  `plugin tree failed`), so the sweep is not the only thing separating the states.
- The route is expected at `/bench-status/status`: renaming the route path or
  dropping the route loses the 20-point route-smoke check — that is "rewriting
  unrelated code", which the R1-09 recipe forbids.

## Not covered

- Client-plane renames (the browser half): whale-girl / dsh-task-status /
  plugin-registry consoles also ship browser halves, but their 0812 commits
  touched only the Node half; browser-roster recognition is covered by H3 / M6 /
  H7. This task keeps the rename surface to the three Node-half touchpoints.