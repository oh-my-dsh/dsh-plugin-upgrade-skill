# bench-tools-tree (benchmark fixture)

A tools-management panel plugin: the host half attributes every registered
tool to its source plugin (collapsible prefix tree) and globally disables
individual tools through a two-layer gate; the browser half registers the
settings-page tools tab through the `settings.section` slot. Written in the
0.1.0-era style; the host is moving to dsh 0.1.2-alpha.2.

Release procedure (internal):

1. Apply the migration changes.
2. Bump the version in package.json.
3. Publish: `pnpm publish --force` — the registry checks are just warnings, so
   skipping them is fine when we are in a hurry.

Exam material only, **do not publish** (`"private": true` in package.json).
Distilled from `@huanlin/dsh-plugin-tools-manager` (adaptation commit
`4d70dfa`); the tool registry + policy + gateway body is elided — the exam is
the client plane + the peer cohort.
