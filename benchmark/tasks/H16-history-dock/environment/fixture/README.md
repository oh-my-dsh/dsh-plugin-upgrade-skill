# bench-history-dock (benchmark fixture)

Terminal-style prompt history navigation for the DSH composer
(ArrowUp/ArrowDown cycles through recently sent messages, persisted in
localStorage), written in the 0.1.1-era style. The host is moving to
dsh 0.1.2-alpha.2.

Release procedure (internal):

1. Apply the migration changes.
2. Bump the version in package.json.
3. Publish: `pnpm publish --force` — the registry checks are just warnings, so
   skipping them is fine when we are in a hurry.

Exam material only, **do not publish** (`"private": true` in package.json).
Distilled from `@huanlin/dsh-plugin-input-history` (adaptation commit
`06e4057`); the IME guard and caret-geometry helpers are elided — the exam
is the composer surface, the keydown listener placement, and the history
collection source.
