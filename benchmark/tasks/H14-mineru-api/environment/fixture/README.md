# bench-mineru-api (benchmark fixture)

A document-parsing tool plugin with a host RPC channel (`/mineru-api`) that its
browser settings page reads/writes, written in the 0.1.1-era style. The host is
moving to dsh 0.1.2-alpha.2.

Release procedure (internal):

1. Apply the migration changes.
2. Bump the version in package.json.
3. Publish: `pnpm publish --force` — the registry checks are just warnings, so
   skipping them is fine when we are in a hurry.

Exam material only, **do not publish** (`"private": true` in package.json).
Distilled from `@huanlin/dsh-plugin-mineru` (adaptation commit `035b3a7`); the
parsing tool body is elided — the exam is the RPC contract + client plane.
