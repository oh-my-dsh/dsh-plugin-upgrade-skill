# bench-interpreters-card (benchmark fixture)

An interpreter-path tool plugin: the host half registers `run_python` /
`run_node` tools and exposes the `interpreters` config through a self-hosted
`/interpreters/api` HTTP gateway route (reads/writes the settings namespace
in-process through the settings bridge); the browser half registers a
settings-plugins card that reads/writes through that route and converges on
pushed connection invalidations. Written in the 0.1.1-era style. The host is
moving to dsh 0.1.2-alpha.2.

Release procedure (internal):

1. Apply the migration changes.
2. Bump the version in package.json.
3. Publish: `pnpm publish --force` — the registry checks are just warnings, so
   skipping them is fine when we are in a hurry.

Exam material only, **do not publish** (`"private": true` in package.json).
Distilled from `@huanlin/dsh-plugin-interpreters` (adaptation commit
`6e3d2d2`); the tool bodies and card component are elided — the exam is the
type surface (snapshot store + settings type) + the client plane.
