# S8 · Release Routing Trap — Diagnosis Report

## Evidence base (fixture/, read-only)
- `ls-remote-tags.txt` — tag list of the public mirror `github.com/public-org/dsh-ui-progress`
- `dsh-version.txt` — consumer runtime: `dsh --version` → **0.1.1-rc.2**
- `compat-table.md` — plugin↔DSH compatibility matrix from the plugin README
- `sync-script.sh` — release sync script excerpt run per mirror after every release
- Task brief — attempt-1 README pin `#v0.9.5` (pnpm failed immediately); attempt-2 pin `#v0.9.7` (installed, then slot crash `TypeError: useConversation is not a function`)

---

## 1. Attempt-1 root cause — tag distribution defect (mirror missing the tag)

The README's default install command pinned `#v0.9.5`, but the mirror's own tag listing
(`git ls-remote --tags`) contains **no `v0.9.5`** — the sequence is
…v0.9.0, v0.9.1, then jumps straight to **v0.9.7** (v0.9.2–v0.9.6 are all absent).
With a `github:owner/repo#<tag>` source, pnpm resolves the tag via git against that
remote; a tag that does not exist on the remote fails resolution immediately and
deterministically — exactly the observed "pnpm failed immediately". This is not a network
or command problem on the consumer side.

The release-engineering defect is in `sync-script.sh`: after every release it runs, per
mirror, only

    git push --force-with-lease "$remote" HEAD:main

i.e. it pushes **only the main branch and never the tags** (no `--tags` / no
`git push "$remote" vX.Y.Z`). Tags therefore reach the mirrors only through whatever
ad-hoc/manual pushes happen outside this script. The result is tag drift: the canonical
repo (and the README written against it) knew `v0.9.5`, while the public mirrors never
received it. The docs pointed consumers at a ref the release pipeline had never
distributed.

## 2. Attempt-2 root cause — version-routing defect (plugin newer than the runtime)

Bumping the README to `#v0.9.7` made the install succeed because v0.9.7 **does** exist on
the mirror (someone pushed that one tag). But install success ≠ runtime compatibility:

- Per `compat-table.md`, **v0.9.7 targets `dsh-v0.1.2-alpha.1`** — it was "migrated to
  the alpha.1 client API (views/legacy projection + **useConversation** seat)".
- The consumer's actual runtime is **dsh 0.1.1-rc.2** (`dsh-version.txt`), i.e. the older
  rc-line client API, which has **no `useConversation` export/seat**.

So the compatibility direction is: **plugin artifact v0.9.7 → built for the NEWER
DSH 0.1.2-alpha.1 API; consumer runtime 0.1.1-rc.2 → older rc API**. The plugin calls
`useConversation()` from the alpha.1 client API; on 0.1.1-rc.2 that symbol is absent/
not a function, so the slot entry throws `TypeError: useConversation is not a function`
at render time. Reinstalling or restarting dsh cannot help — the mismatch is baked into
which artifact was routed to this runtime ("newest tag" ≠ "right tag for this runtime").
Per the same table, the correct line for rc runtimes is v0.9.3 ↔ dsh 0.1.1-rc.1, with rc.2
explicitly noted as rc.1 + additive image preprocessing — i.e. rc.2 stays compatible with
the rc-targeting plugin builds.

## 3. Exact remedy for the consumer right now (production freeze, cannot upgrade dsh)

Pin the **newest tag that both exists on the mirror and targets the rc-line API**. The
table's ideal pick v0.9.3 is itself absent from the mirror tag list, so the highest usable
tag is **v0.9.1** (present in `ls-remote-tags.txt`, released before the v0.9.7 alpha.1
migration, hence built against the rc client API that 0.1.1-rc.2 provides):

    dsh plugin --profile web remove '@org/dsh-ui-progress'   # drop the broken v0.9.7 entry
    dsh plugin --profile web add '@org/dsh-ui-progress@github:public-org/dsh-ui-progress#v0.9.1'

Then restart dsh (or reload the web client) so the slot re-registers. No runtime upgrade
required; do **not** use `#v0.9.5` (not on the mirror) or `#v0.9.7` (requires
dsh ≥ v0.1.2-alpha.1). When the freeze lifts and the runtime moves to ≥ 0.1.2-alpha.1,
`#v0.9.7` becomes the correct pin.

## 4. Maintainer-side fix — so neither defect can recur

**Release tooling (fixes defect 1 — tag distribution):**
- In the per-mirror sync script, push tags together with the branch, e.g.
  `git push --force-with-lease "$remote" HEAD:main` **plus** `git push --force-with-lease "$remote" --tags`
  (or per-release `git push "$remote" "v$VERSION"`), for every mirror (origin, public, mirror2).
- Add a post-sync verification gate: for each mirror, `git ls-remote --tags <mirror>` must
  contain the just-released tag **and** the tag currently referenced by the README install
  command; fail the release/announcement if either is missing. Backfill the missing tags
  (v0.9.2–v0.9.6, incl. v0.9.3) to all mirrors once.

**Docs / routing (fixes defect 2 — version routing):**
- Stop pointing the default install command at a bare "newest" tag. Publish the
  plugin↔DSH compatibility matrix in the README next to the install command and give
  per-runtime commands, e.g. "dsh 0.1.1-rc.x → `#v0.9.1`/`#v0.9.3`; dsh ≥ 0.1.2-alpha.1 → `#v0.9.7`",
  and tell users to check `dsh --version` first.
- Declare the supported runtime range in the plugin manifest (an engines/peer-style
  `dsh` version range, e.g. `>=0.1.2-alpha.1` for v0.9.7) so the installer **rejects an
  incompatible runtime at install time with a clear message** instead of letting the slot
  crash in the browser later.
- Make the README-update step part of the same release checklist that pushes tags, so docs
  can never reference a ref that has not been distributed to every mirror.

---
### One-line summary
Attempt 1 = **tag distribution**: the sync script pushes only `HEAD:main`, never tags, so
`v0.9.5` never reached the mirrors. Attempt 2 = **version routing**: `v0.9.7` targets the
newer DSH 0.1.2-alpha.1 client API (`useConversation`), but the consumer runs the older
0.1.1-rc.2. Remedy under the freeze: pin `#v0.9.1`. Maintainer fix: push + verify tags on
every mirror, and route installs via a published compat matrix plus a manifest engine range.
