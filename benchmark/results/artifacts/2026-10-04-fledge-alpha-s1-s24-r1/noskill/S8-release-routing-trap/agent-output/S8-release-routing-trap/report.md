# S8 — Release Routing Trap: Diagnosis Report

## 1. Attempt-1 root cause: `#v0.9.5` cannot resolve (tag distribution defect)

The tag `v0.9.5` does not exist on the public mirror. The mirror's own tag listing
(`fixture/ls-remote-tags.txt`) jumps straight from `v0.9.1` to `v0.9.7`:

```
refs/tags/v0.9.1
refs/tags/v0.9.7
```

`v0.9.2`–`v0.9.6` are all absent, yet the README's default install command pins
`#v0.9.5`. A `github:org/repo#<tag>` install asks pnpm to resolve that exact git ref;
with no such ref on the mirror, resolution fails immediately — before any package code
is even fetched. This is a maintainer-side release defect, not a consumer network or
command problem: the README advertised a tag that was never distributed to the mirror
the README itself points at.

The tooling defect is visible in `fixture/sync-script.sh`: the post-release sync loop
only pushes the main branch —

```bash
git push --force-with-lease "$remote" HEAD:main
```

— and never pushes tags (`--tags` / `--follow-tags` are missing). So whatever tags
land on each mirror get there ad hoc, and the README can drift ahead of what the
mirrors actually serve.

## 2. Attempt-2 root cause: `#v0.9.7` installs, then crashes (version routing defect)

Compatibility direction, from `fixture/compat-table.md`:

| Plugin artifact | Targets DSH version |
|---|---|
| v0.9.3 | `@deepseek-ai/dsh@0.1.1-rc.1` (rc.2 = rc.1 + additive image preprocessing, so v0.9.3 is also valid on rc.2) |
| v0.9.7 | `dsh-v0.1.2-alpha.1` — migrated to the alpha.1 client API (views/legacy projection + **`useConversation` seat**) |

The consumer's runtime (`fixture/dsh-version.txt`) is **dsh 0.1.1-rc.2** — older than
the artifact's target. `v0.9.7` is *forward-targeted* at the newer 0.1.2-alpha.1
client API and is not backward-compatible: it imports the `useConversation` client
seat, which only exists in the 0.1.2-alpha.1 API surface. On 0.1.1-rc.2 that export
does not exist, so the slot entry crashes at runtime with
`TypeError: useConversation is not a function`. Restarting dsh cannot help because the
mismatch is baked into the installed artifact, not into process state.

In short: "newest tag" ≠ "newest compatible tag". The README bumps routed the
consumer to an artifact built for a newer runtime than theirs.

## 3. Exact remedy for the consumer right now

Pin the newest tag that targets their frozen runtime (0.1.1-rc.2). Per the compat
table that is **v0.9.3** (rc.2 is an additive superset of rc.1):

```
dsh plugin remove '@org/dsh-ui-progress'   # clear the broken v0.9.7 install first
dsh plugin --profile web add '@org/dsh-ui-progress@github:public-org/dsh-ui-progress#v0.9.3'
```

`v0.9.3` exists on the mirror and is built against the 0.1.1-rc.x client API, so it
both resolves and runs on the consumer's current dsh — no runtime upgrade required.

## 4. Maintainer-side fixes so neither defect recurs

**Release tooling (fixes defect 1 — tag distribution):**
- Push tags in the sync loop, e.g.
  `git push --force-with-lease "$remote" HEAD:main` **and**
  `git push "$remote" --tags` (or use `git push --follow-tags`), for every mirror
  (`origin`, `public`, `mirror2`).
- Add a post-release verification step: run `git ls-remote --tags <mirror>` for each
  mirror and fail the release if the just-cut tag is missing everywhere it should be.
- Ideally generate the README's pinned tag from the release tooling (single source of
  truth) so docs can never reference an undistributed tag.

**Docs / version routing (fixes defect 2 — incompatible newest tag):**
- Replace the single "default install command" with a routing table in the README:
  - dsh `0.1.1-rc.x` → `#v0.9.3`
  - dsh `0.1.2-alpha.1`+ → `#v0.9.7`
  Never instruct users to chase the newest tag blindly.
- Declare a supported dsh version range in the plugin manifest (peer/engine-style
  constraint) so the installer *rejects* an incompatible plugin/runtime pairing at
  install time instead of crashing in the browser at runtime.
- When cutting a release that requires a newer DSH API (like the alpha.1
  `useConversation` migration), keep publishing/retaining a compat line for the older
  runtime and document it explicitly.

## Limitations

None material — the static evidence pack (mirror tag listing, consumer dsh version,
compat table, sync script excerpt) was sufficient to establish both root causes. No
external documentation was consulted.
