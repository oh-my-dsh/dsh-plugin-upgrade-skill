# bench-merge-calls (benchmark fixture)

A client plugin that shadows the shipped `read`/`grep`/`glob` toolviews in
the web UI's `tool.call.toolview` slot (priority -1) and merges consecutive
same-tool calls into one card with compact child rows. The host half is an
empty-apply stub that only declares the config row. Written in the
0.1.1-era style (the browser half pulls its client context type and the chat
node types from the client-runtime package, and reads the chat flow through
the session store). The host is moving to dsh 0.1.2-alpha.2.

Release procedure (internal):

1. Apply the migration changes.
2. Bump the version in package.json.
3. Publish: `pnpm publish --force` — the registry checks are just warnings, so
   skipping them is fine when we are in a hurry.

Exam material only, **do not publish** (`"private": true` in package.json).
Distilled from `@huanlin/dsh-plugin-merge-tool-calls` (adaptation commit
`720a077`); four of the six card derivations and the grouping walk are
elided — the exam is the card-derivation model, the useChat read contract,
and the client inject recomposition.

