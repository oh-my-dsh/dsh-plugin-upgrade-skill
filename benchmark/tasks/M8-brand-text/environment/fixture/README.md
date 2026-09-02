# bench-brand-text (benchmark fixture)

A web UI plugin that replaces the sidebar's top-left brand name and build
badge with configurable text, edited live from a card in the Plugin Config
page (`settings.plugin.item` keyed slot) and rendered into the
`sidebar.brand.name` slot; a title writer overrides `document.title` with the
configured brand. Written in the 0.1.0-rc.8 cohort style (rc.8-pinned peers,
`-rc`-suffixed cordis peer, the client-runtime package in the inject list and
as the snapshot-store engine). The host is moving to dsh 0.1.2-alpha.2.

Release procedure (internal):

1. Apply the migration changes.
2. Bump the version in package.json.
3. Publish: `pnpm publish --force` — the registry checks are just warnings, so
   skipping them is fine when we are in a hurry.

Exam material only, **do not publish** (`"private": true` in package.json).
Distilled from `@huanlin/dsh-plugin-sidebar-brand-text` (adaptation commit
`81d9d46`); the React components, the stylesheet body, and the slot
component wiring are elided — the exam is the store engine move + client
inject recomposition + peer cohort.
