# S8 · Release Routing Trap — Diagnosis Report

Task: two-stage install failure for the community plugin `@org/dsh-ui-progress` distributed
via GitHub mirrors. All findings below are derived from the static evidence pack in the
fixture directory (read-only).

Evidence used:

- fixture\ls-remote-tags.txt — actual tags present on the public mirror
- fixture\sync-script.sh — the post-release mirror sync script
- fixture\compat-table.md — plugin-version ↔ DSH-version compatibility table
- fixture\dsh-version.txt — the consumer's runtime version
- fixture\README.md — fixture description

## 1. Attempt-1 root cause: `#v0.9.5` could not resolve

The README's pinned install command references tag `v0.9.5`, but the mirror's actual tag
listing jumps straight from `v0.9.1` to `v0.9.7`:

```
refs/tags/v0.9.0
refs/tags/v0.9.1
refs/tags/v0.9.7        ← v0.9.2 … v0.9.6 are absent
```

So pnpm failed immediately because the tag `v0.9.5` simply does not exist on
`github.com/public-org/dsh-ui-progress` — there is nothing at that ref for pnpm to
resolve. This is not a network or command-typing problem on the consumer's side; the ref
is missing from the distribution point the README points at.

The release-engineering defect is in the sync script. It only ever pushes the branch tip:

```bash
git push --force-with-lease "$remote" HEAD:main
```

It never pushes tags (no `--follow-tags`, no `--tags`, no explicit `refs/tags/...` refspec)
to any of `origin`, `public`, or `mirror2`. Tags reach mirrors only when someone pushes them
by hand, so intermediate release tags (`v0.9.2`–`v0.9.6`, including `v0.9.5`) were silently
never distributed, while `v0.9.7` happened to be pushed manually. The README pins a tag
that the release tooling never guaranteed would exist on the mirror.

## 2. Attempt-2 root cause: `#v0.9.7` installs but crashes

`v0.9.7` does exist on the mirror, so the install itself succeeds. The crash is a version
routing (compatibility-direction) failure:

| Plugin version | Targets DSH version | Consumer's DSH |
|---|---|---|
| v0.9.3 | npm @deepseek-ai/dsh@0.1.1-rc.1 (rc.2 = rc.1 + additive image preprocessing) | 0.1.1-rc.2 |
| v0.9.7 | dsh-v0.1.2-alpha.1 — migrated to the **alpha.1 client API** (views/legacy projection + `useConversation` seat) | 0.1.1-rc.2 |

The compatibility direction is: the plugin artifact targets a DSH version, and
`v0.9.7` targets a **newer** DSH (`0.1.2-alpha.1`) than the consumer's frozen runtime
(`0.1.1-rc.2`). The v0.9.7 client bundle calls the alpha.1 client API seat
`useConversation`, which does not exist in the 0.1.1-rc.2 client runtime — hence
`TypeError: useConversation is not a function` in the browser slot entry. Restarting dsh
cannot help because the API is absent from the runtime itself, not merely stale-cached.
Bumping the README tag to "newest" routed the consumer onto an artifact built for a
prerelease DSH channel his runtime does not have.

## 3. Remedy for the consumer right now (works on DSH 0.1.1-rc.2)

The consumer needs the newest plugin version that targets the `0.1.1-rc.x` line: that is
`v0.9.3` (the compat table states rc.2 is rc.1 plus additive image preprocessing, so a
plugin verified on rc.1 is compatible with rc.2).

However, `v0.9.3` is also missing from the mirror's tag list (only `v0.9.0`, `v0.9.1`,
`v0.9.7` are there), so the same mirror URL cannot serve it. The consumer should install
from the canonical origin repository, where release history is complete:

```
dsh plugin --profile web add '@org/dsh-ui-progress@github:<origin-org>/dsh-ui-progress#v0.9.3'
```

(`<origin-org>` = the plugin's canonical GitHub org, i.e. the `origin` remote in
sync-script.sh, not the `public-org` mirror.) This installs a client bundle that uses only
APIs present in 0.1.1-rc.2 and eliminates the `useConversation` crash. If for some reason
the origin repo is not usable, the maintainer pushing the missing tags to the mirrors (see
below) unblocks the mirror URL with the same `#v0.9.3` pin. The consumer must **not** stay
on `#v0.9.7` and cannot upgrade dsh (production freeze).

## 4. Maintainer-side fix (release tooling + docs)

Tooling — make tag distribution automatic and verified:

1. Fix the sync script so tags are distributed with every release, e.g.:
   ```bash
   for remote in origin public mirror2; do
     git push --force-with-lease "$remote" HEAD:main
     git push "$remote" --tags
   done
   ```
   (or `--follow-tags` if only release-annotated tags should propagate).
2. Add a post-sync verification step that fails the release if any git tag reachable from
   the release commit is missing on any mirror:
   `git ls-remote --tags "$remote"` must contain every tag present in the canonical repo.
   This turns "silently missing tag" into a loud release failure.

Docs — make version routing explicit:

3. Stop pinning the README to "the newest tag". The README install command should pin a
   tag whose DSH target matches a released, non-prerelease DSH line, and should show the
   compat mapping (the compat-table content) inline, e.g. one command per DSH version:
   - DSH 0.1.1-rc.x → `...#v0.9.3`
   - DSH 0.1.2-alpha.1 → `...#v0.9.7`
4. Optionally encode the routing in the artifact itself: declare the targeted DSH client
   API / runtime version in plugin metadata (peer-style constraint) so a mismatched install
   fails loudly at load ("this build targets dsh 0.1.2-alpha.1") instead of crashing in the
   browser slot with a `TypeError`.

These together prevent both defects: tags can no longer be missing from mirrors
(sync pushes + verifies tags), and consumers can no longer be routed to an artifact built
for a DSH version newer than their runtime (compat-pinned docs and loud-load metadata).
