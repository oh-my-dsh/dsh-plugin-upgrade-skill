# Six-plugin fleet crossing of the 0.1.5-rc.2 → 0.1.6-alpha.1 edge (2026-09-15)

Runtime companion to the [0.1.6-alpha.1 card set](v0.1.6-alpha.1.md). This is a first-hand
release-day record, not a card set: it carries no card IDs and does not restate the upstream
diff. Read the cards for what changed; read this file for how one real client-plugin fleet
actually crossed the edge.

- **Host edge**: `dsh-v0.1.5-rc.2` → `dsh-v0.1.6-alpha.1` (release day, 2026-09-15).
- **Fleet**: dsh-file-trace, dsh-ui-progress, dsh-ui-whale, dsh-minigames, dsh-input-history,
  dsh-paste-input — all link-installed into the web profile.
- **Outcome**: zero client-plugin-facing code changes were needed; every plugin shipped a
  declare-support patch release the same day.

## Declare-support releases

| Plugin | Release | Checks on the upgraded host |
|---|---|---|
| dsh-file-trace | v0.3.13 | typecheck green · vitest 105 tests green |
| dsh-ui-progress | v0.10.1 | typecheck green · vitest 45 tests green |
| dsh-ui-whale | v0.3.19 | typecheck green · vitest 34 tests green |
| dsh-minigames | v0.3.20 | typecheck green · vitest 203 tests green |
| dsh-input-history | v0.1.14 | typecheck green · vitest 18 tests green |
| dsh-paste-input | v0.1.26 | lib-only package: `node --check` on `lib` (no typecheck/vitest step) |

- Typecheck was green on all five compiled plugins; vitest totals 105 + 45 + 34 + 203 + 18 =
  405 tests.
- Each release tag was pushed to all three mirrors and verified with `git ls-remote`.
- The upgraded host booted with all six plugins present in the boot manifest.

## Why the fleet needed no code changes

None of the six plugins references the surfaces this edge breaks for Host plugins:

- no deprecated synchronous history reads (`Session.eventAt()` / `snapshotEvents()` /
  `ownEvents()`, card DSH-0.1.6-A1-03);
- no `agent/session-start` listener (card DSH-0.1.6-A1-01);
- no old code-runtime package, row or service names (card DSH-0.1.6-A1-07).

That is consistent with the edge's breaking cards landing on the Host, runtime and
composition planes. It is evidence for this fleet only: plugins that listen for agent
lifecycle events, provide execution runtimes, or consume the renamed Web Client surfaces
(cards DSH-0.1.6-A1-20 to DSH-0.1.6-A1-26) must still work through the card set.

## Scope and limits

- First-hand observation by the fleet maintainer on release day; the plugin repositories and
  their release tags are the evidence, not the upstream source tree.
- Six client plugins, one web profile, link installs only. Registry installs and the Desktop
  profile (card DSH-0.1.6-A1-37) were not exercised.
- The next edge, `dsh-v0.1.6-alpha.1` → `dsh-v0.1.6-alpha.2`, did require code changes in three
  of these plugins (dsh-input-history, dsh-paste-input, dsh-ui-progress); see that edge's card
  set once it lands.
