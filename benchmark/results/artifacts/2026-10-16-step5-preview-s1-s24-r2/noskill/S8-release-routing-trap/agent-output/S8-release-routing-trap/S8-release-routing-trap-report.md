# S8 · Release Routing Trap — Release-Engineering Diagnosis

**Scope:** static diagnosis from the read-only evidence pack (`fixture/`). The fixture was inspected
read-only and is unchanged; nothing was executed, installed, migrated, or published.

## TL;DR

| | Symptom | Root cause | Defect class |
|---|---|---|---|
| Attempt 1 | `#v0.9.5` cannot resolve — pnpm fails immediately | The pinned tag was never **distributed** to the public mirror the install command resolves against; the release sync script pushes only `main`, never tags | **Tag distribution** |
| Attempt 2 | `#v0.9.7` installs, then slot entry crashes with `TypeError: useConversation is not a function` | v0.9.7 is built for **dsh 0.1.2-alpha.1**; the consumer runs **0.1.1-rc.2**, whose client API has no `useConversation` | **Version routing** (artifact built against a *newer* DSH than the runtime) |

**Remedy (consumer, frozen on 0.1.1-rc.2):** pin the plugin to the build routed to the 0.1.1 line —
`#v0.9.3` once its tag is pushed to the mirror; until then, `#v0.9.1`, the newest mirrored tag that
predates the alpha.1 API migration. Never `#v0.9.7` / `main`, and no dsh upgrade.

---

## 1. Attempt-1 root cause — `#v0.9.5` could not resolve (tag distribution defect)

### Evidence

- `fixture/ls-remote-tags.txt` — `git ls-remote --tags https://github.com/public-org/dsh-ui-progress.git`,
  i.e. exactly the source the README command resolves against
  (`@org/dsh-ui-progress@github:public-org/dsh-ui-progress#v0.9.5`). The mirror's tag set is:
  v0.1.0 … v0.8.0, **v0.9.0, v0.9.1, v0.9.7**. There is **no v0.9.5** (nor v0.9.2–v0.9.4, v0.9.6) —
  the listing jumps straight from v0.9.1 to v0.9.7.
- `fixture/sync-script.sh` — the release sync that "runs after every release, for each mirror":

  ```bash
  for remote in origin public mirror2; do
    # rewrite install-source orgs for the target mirror, then:
    git push --force-with-lease "$remote" HEAD:main
  done
  ```

### Root cause

The release pipeline distributes **branches only**. `git push --force-with-lease "$remote" HEAD:main`
propagates the commit graph to every mirror, but **no refspec ever carries `refs/tags/*`**. Release
tags therefore never reach the mirrors through the release process; whatever tags a mirror has got
there by hand. That is precisely the observed shape: v0.9.7 is the one tag someone pushed manually
(presumably when the README was bumped to it), while v0.9.2–v0.9.6 — including the README's pinned
**v0.9.5** — exist only upstream of the mirror, if anywhere.

The README's default install command is a **tag pin** against a mirror whose tag set the release
process does not control, and nothing verifies that the pinned ref actually resolves on each mirror
before the docs ship. Result: the spec
`@org/dsh-ui-progress@github:public-org/dsh-ui-progress#v0.9.5` fails at ref-resolution time —
"pnpm failed immediately", before any package bytes move.

### Why this is not the consumer's network or command

The command form is correct — the identical form succeeded for `#v0.9.7` in attempt 2. So this is not
a typo, not a network/proxy/firewall issue, and not a pnpm cache problem. The defect is on the
release-engineering side: **an undistributed tag was documented as the default install pin.**

---

## 2. Attempt-2 root cause — newest tag, wrong DSH line (version routing defect)

### Evidence

- `fixture/dsh-version.txt` — the consumer's runtime: `dsh --version` → **0.1.1-rc.2**.
- `fixture/compat-table.md` (from the plugin README):

  | Plugin version | DSH version | Notes |
  |---|---|---|
  | v0.9.3 | npm @deepseek-ai/dsh@0.1.1-rc.1 | rc.1 real-boot verified; rc.2 is rc.1 + image preprocessing (additive) |
  | v0.9.7 | dsh-v0.1.2-alpha.1 | Migrated to the alpha.1 client API (views/legacy projection + useConversation seat) |

### Compatibility direction: the artifact is built forward against a *newer* DSH than the consumer runs

- **v0.9.7 targets `dsh-v0.1.2-alpha.1`** — the next minor line. Its own release note says it
  *migrated to the alpha.1 client API*, whose views/legacy projection adds the `useConversation` hook
  ("seat"). That hook is an alpha.1 addition.
- **The consumer runs `0.1.1-rc.2`.** The 0.1.1 line's client API has no `useConversation` at all.
  rc.1 → rc.2 was *additive* (image preprocessing) — which is why the rc.1-targeted v0.9.3 still runs
  on rc.2 — but nothing in the 0.1.1 line gained `useConversation`.
- So v0.9.7's slot entry imports/calls `useConversation` against a runtime that does not export it.
  The error is "`useConversation is not a function`" (not "is not defined"), i.e. the imported binding
  resolves to `undefined` on 0.1.1-rc.2 — the whole projection is missing from the runtime's
  client-API surface.

### Tie to the consumer's runtime, and why restarting dsh did not help

The failure is a deterministic API-shape mismatch at entry load, not state. Every boot re-evaluates
the same slot entry against the same 0.1.1-rc.2 client API, so a restart cannot change the outcome.
The install "succeeding" is expected and misleading: the tag exists on the mirror (it resolves,
downloads, installs) — resolution says nothing about runtime compatibility.

### The underlying release-engineering defect

**"Newest tag" is not the routing key — DSH version is.** The plugin publishes builds for two
different DSH lines (0.1.1-rc.x and 0.1.2-alpha.x) under one monotonically increasing tag series,
and the README tells users to install the newest tag. A consumer on the older line who follows that
instruction is routed to a build their runtime cannot satisfy. The maintainer's "bump the README to
the newest tag" reflex made this worse, not better: it moved the consumer from a nonexistent pin to
an existing-but-incompatible one, changing the failure mode without fixing anything.

---

## 3. Exact remedy for the consumer right now

**Constraint:** dsh stays on 0.1.1-rc.2 (production freeze). The plugin must therefore be the build
routed to the 0.1.1 line — per the compat table that is **v0.9.3** (targets
@deepseek-ai/dsh@0.1.1-rc.1; rc.2 = rc.1 + additive image preprocessing ⇒ rc.2-compatible):

```bash
dsh plugin --profile web add '@org/dsh-ui-progress@github:public-org/dsh-ui-progress#v0.9.3'
```

**Caveat from the same evidence:** v0.9.3 is *not* in the mirror's current tag listing (only v0.9.0,
v0.9.1, v0.9.7 are mirrored in the 0.9 series — the same tag-distribution defect as attempt 1). So:

1. **Immediately, with no maintainer action required** — pin the newest mirrored tag that predates
   the alpha.1 migration and therefore still targets the 0.1.1 line: **v0.9.1**

   ```bash
   dsh plugin --profile web add '@org/dsh-ui-progress@github:public-org/dsh-ui-progress#v0.9.1'
   ```

   (If the profile still holds the broken v0.9.7 install, remove it first or re-add over it with the
   command above.)

2. **Once the maintainer pushes the v0.9.3 tag to both public mirrors** (one command each — see §4.1),
   re-pin to the documented rc.2-compatible build:

   ```bash
   dsh plugin --profile web add '@org/dsh-ui-progress@github:public-org/dsh-ui-progress#v0.9.3'
   ```

**Do not:**

- install `#v0.9.7`, `main`, or `HEAD` — main tracks the alpha.1-migrated code and produces the
  identical `useConversation` crash;
- upgrade the dsh runtime (production freeze);
- treat "newest tag" as the selection criterion while on the 0.1.1 line.

Any tag routed to dsh 0.1.2-alpha.x is off-limits until the runtime moves.

---

## 4. Maintainer-side fix so neither defect can recur

### 4.1 Tag distribution (closes attempt 1)

1. **Push tags in the sync script.** Carry refs, not just the branch:

   ```bash
   for remote in origin public mirror2; do
     git push --force-with-lease "$remote" HEAD:main
     git push --force-with-lease "$remote" --tags        # or: refs/tags/*:refs/tags/*
   done
   ```

   Better: make tag propagation part of the release job itself — `git tag -a` → `git push origin --tags`
   → mirror sync with `--atomic --tags` — so a release is not "done" until every mirror carries its
   tag. (`--force-with-lease` on `main` is fine for the branch; tags must never be force-moved.)
2. **CI gate on ref distribution.** After every release, a job runs `git ls-remote --tags` against each
   mirror and fails unless (a) every tag on `origin` exists on every mirror, and (b) **every ref pinned
   anywhere in the repo — README install commands, docs, CI matrices — resolves on every mirror**.
   This is the check whose absence let the README ship a pin to an undistributed tag.
3. **Single source of truth for install commands.** Generate the README install snippet from the
   release manifest (tag + mirror URLs) instead of hand-editing, so docs cannot reference a ref that
   was not distributed.

### 4.2 Version routing (closes attempt 2)

1. **Machine-readable compatibility contract.** Declare the targeted DSH line in the plugin manifest
   (e.g. `engines: { dsh: "0.1.2-alpha.x" }` for v0.9.7, `"0.1.1-rc.x"` for v0.9.3) and keep
   `compat-table.md` as the human rendering of that data. The installer can then refuse or warn when
   the runtime is below the declared floor, instead of installing a build that crashes at slot load.
2. **CI compatibility check per claimed DSH line.** Type-check / boot-test each release against the
   client API of every DSH line it claims to support. The compat table shows the practice already
   exists ("rc.1 real-boot verified") — extend it so a build importing `useConversation` cannot pass
   a gate that declares 0.1.1 support.
3. **Defensive slot entry.** Feature-detect before use (`typeof useConversation === "function"`, or a
   try/catch that surfaces "plugin vX requires dsh ≥ Y") so a routing mistake degrades to an
   actionable error instead of an opaque TypeError in the browser.
4. **Docs that route by runtime, not by recency.** Replace "install the newest tag" with a
   runtime→tag table ("on dsh 0.1.1-rc.x install `#v0.9.3`; on 0.1.2-alpha.x install `#v0.9.7`"). If both
   lines must be served simultaneously, split the tag series per line (e.g. v0.9.x = 0.1.1-compatible
   maintenance line, v0.10.x = 0.1.2-alpha line) so "newest tag" stops being a trap.
5. **Never bump a README pin as a troubleshooting reflex.** v0.9.5 → v0.9.7 only changed the failure
   mode (unresolvable pin → crash-on-load) while addressing neither root cause; pins must be chosen
   from the compat table against the *user's* DSH version, not by tag recency.

---

## Appendix — evidence index (all under `fixture/`, read-only, unmodified)

| File | What it establishes |
|---|---|
| `ls-remote-tags.txt` | Mirror tag listing: **v0.9.5 absent**, v0.9.7 present, gap v0.9.1 → v0.9.7 |
| `sync-script.sh` | Per-mirror sync pushes `HEAD:main` only — **no `--tags`**, so tags are never distributed |
| `compat-table.md` | v0.9.3 → @deepseek-ai/dsh@0.1.1-rc.1 (rc.2 additive-compatible); v0.9.7 → dsh-v0.1.2-alpha.1 (alpha.1 client API + `useConversation` seat) |
| `dsh-version.txt` | Consumer runtime: **0.1.1-rc.2** |
| (task brief) | Attempt-2 crash symptom `TypeError: useConversation is not a function` — quoted in the brief, no log file shipped |
