# S8 · Release Routing Trap — Diagnosis Report

Fixture reviewed (read-only): `fixture/README.md`, `fixture/compat-table.md`,
`fixture/dsh-version.txt`, `fixture/ls-remote-tags.txt`, `fixture/sync-script.sh`.
No external documentation was consulted; the fixture is treated as complete.

## 1. Attempt-1 root cause — why `#v0.9.5` could not resolve

The install command itself was fine; the tag does not exist on the install
source. `fixture/ls-remote-tags.txt` shows the public mirror's tag list jumps
from `refs/tags/v0.9.1` straight to `refs/tags/v0.9.7` — `v0.9.5` (and
`v0.9.2`/`v0.9.3`/`v0.9.4`/`v0.9.6`) were never distributed there. When
pnpm/GitHub source resolution looks up `github:public-org/dsh-ui-progress#v0.9.5`,
it finds no such ref and fails immediately, before any compatibility check.

The release-engineering defect is in `fixture/sync-script.sh`: for each mirror it
runs only

```
git push --force-with-lease "$remote" HEAD:main
```

i.e. it force-updates the `main` branch and **never pushes or syncs any git tag**
(no `--tags`, no `refs/tags/*` refspec). Release tags therefore reach the public
mirrors only incidentally (e.g. manual pushes, which explains the stray
`v0.9.7`), so a stretch of release tags — including the README's pinned `v0.9.5` —
was silently lost on the mirror. That is a tag-distribution gap, not a problem
with the consumer's network or command.

## 2. Attempt-2 root cause — why the newest tag installed but crashes

`#v0.9.7` resolved (it happens to be one of the tags present on the mirror), so
the install "succeeded". The crash is a runtime-cohort mismatch:

- `fixture/dsh-version.txt`: the consumer's dsh is `0.1.1-rc.2`.
- `fixture/compat-table.md`:
  - `v0.9.3` → `npm @deepseek-ai/dsh@0.1.1-rc.1` (the rc cohort; `rc.2` is
    `rc.1` + additive image preprocessing, so it belongs to the same cohort).
  - `v0.9.7` → `dsh-v0.1.2-alpha.1`, i.e. the plugin was **migrated to the
    alpha.1 client API** (views/legacy projection + `useConversation` seat).

Direction of compatibility: **newer plugin artifacts target newer DSH runtimes.**
`v0.9.7` is built against the alpha.1 client API and exports/uses
`useConversation`, which does not exist in the `0.1.1-rc.2` Web Client bundle.
On the consumer's runtime the slot entry throws `TypeError: useConversation is
not a function` at registration time. Restarting dsh cannot help: this is a
deterministic artifact-vs-host API mismatch, not a stale-cache or boot race.

## 3. Consumer remedy (works on the frozen 0.1.1-rc.2 runtime)

Pin the newest plugin tag that both (a) targets the `0.1.1-rc.x` cohort and
(b) is actually present on the install mirror. From the evidence, the
compat-table's rc-cohort line is `v0.9.3` and earlier, but `v0.9.3` is itself
missing from the mirror tag list; the newest rc-cohort tag that *is* distributed
on the mirror is `v0.9.1`. So:

```
# first drop the incompatible v0.9.7 row from the profile composition, then:
dsh plugin --profile web add '@org/dsh-ui-progress@github:public-org/dsh-ui-progress#v0.9.1'
```

Verify afterwards that the profile resolves to `v0.9.1` (not a lingering
`v0.9.7` row) and that the slot entry activates in the browser. If the
maintainer back-fills the previously undistributed `v0.9.3` tag onto the mirror,
`#v0.9.3` is the preferable pin (it is the compat-table's explicit rc.1 row and
is forward-compatible with rc.2). Do **not** use `#v0.9.7` until dsh itself is
upgraded to the `0.1.2-alpha.1` line or newer.

## 4. Maintainer-side fixes so neither defect recurs

Release tooling:

- In the mirror sync script, publish tags along with the branch, e.g.
  `git push --force-with-lease "$remote" HEAD:main` followed by
  `git push "$remote" --tags` (or an explicit `refs/tags/*:refs/tags/*`
  refspec). Branch-only sync guarantees tags drift.
- Add a post-release gate that compares `git ls-remote --tags` on every mirror
  against origin and fails/alerts on any missing or extra ref, instead of
  discovering gaps from consumer bug reports.
- Treat any README-pinned tag as a release artifact: CI should assert that the
  pinned tag exists on each public mirror *before* a release is called done.

Docs / version routing:

- Publish an explicit plugin-tag → DSH-runtime compatibility table (like
  `fixture/compat-table.md`) in the README, with per-tag "requires DSH ≥
  X.Y.Z" / "last release supporting DSH 0.1.1-rc.x: v0.9.3" callouts, so users
  on pinned runtimes do not default to the newest tag.
- Stop recommending `#<newest>` wholesale; the default install example should
  name the newest tag matching the documented supported runtime, and the
  "latest tag requires DSH 0.1.2-alpha.1+" note should sit next to the command.
- At install/activation time, enforce the plugin's declared DSH cohort (peer
  range) and surface a clear version-mismatch error rather than letting the
  browser crash with `TypeError: useConversation is not a function`.

## Limitations

- Only the fixture evidence was used; the origin repo's actual tag set and the
  other mirror's (`mirror2`) tag listing were not inspected.
- `fixture/sync-script.sh` is an excerpt; the complete release pipeline was not
  reviewed.
