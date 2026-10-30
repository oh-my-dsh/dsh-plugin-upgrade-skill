# S8 · Release Routing Trap — Diagnosis Report

**Consumer symptom (two stages, one install path):**
1. README default install pinned `#v0.9.5` → pnpm failed immediately.
2. README bumped to newest tag `#v0.9.7` → install succeeded, plugin slot entry crashed with
   `TypeError: useConversation is not a function`; restarting dsh did not help.

**Consumer constraint:** dsh runtime is frozen (production freeze) at **0.1.1-rc.2** — remedies must
work on that runtime, so the fix must move the *plugin version*, not the runtime.

**Evidence base (static fixture, read-only):**

| File | What it proves |
|---|---|
| `ls-remote-tags.txt` | Tags actually present on the public mirror `public-org/dsh-ui-progress` |
| `dsh-version.txt` | Consumer runtime: `dsh --version` → `0.1.1-rc.2` |
| `compat-table.md` | Plugin version ↔ DSH version mapping (from the plugin README) |
| `sync-script.sh` | The release→mirror synchronization procedure |

---

## 1. Attempt-1 root cause — release tag was never distributed to the mirror

**Defect: tag distribution failure in the release pipeline (not network, not the consumer's command).**

- `ls-remote-tags.txt` (lines 12–14) shows the public mirror's tags jump straight from
  `refs/tags/v0.9.1` to `refs/tags/v0.9.7`. The whole range **v0.9.2 – v0.9.6 is absent**, and
  `v0.9.5` — the ref the README pinned — **does not exist in the mirror's ref store at all**.
- `sync-script.sh` (lines 3–6) is the smoking gun: after every release it loops over the mirrors
  and pushes **only the branch**:
  ```bash
  for remote in origin public mirror2; do
    # rewrite install-source orgs for the target mirror, then:
    git push --force-with-lease "$remote" HEAD:main
  done
  ```
  There is **no `git push --tags` / `--follow-tags`** and no tag argument anywhere. The annotated
  release tags are created at release time but are *never propagated* to the mirrors — only `main`
  is. Which tags happen to exist on a mirror is left to manual/out-of-band pushes (which is why
  v0.9.0/v0.9.1 and the newest v0.9.7 are there while v0.9.2–v0.9.6 are not).
- Consequence: the README (after the per-mirror org rewrite to `github:public-org/...`) pinned a
  ref that only ever existed on the release origin. pnpm fails **at ref resolution, immediately** —
  consistent with "ref not found on remote," not with a network/transient fault. Retrying, or
  changing the consumer's network, could never have worked.

## 2. Attempt-2 root cause — "newest tag" routed past the consumer's runtime (version routing)

**Defect: the install docs route by tag recency instead of by consumer runtime; the newest tag
targets a DSH version the consumer does not have.**

- `compat-table.md` (line 6): **v0.9.7 targets `dsh-v0.1.2-alpha.1`** — it "migrated to the alpha.1
  client API (views/legacy projection + **useConversation seat**)". So `useConversation` is an export
  that only exists in the 0.1.2-alpha.1 client API.
- `dsh-version.txt`: the consumer runs **0.1.1-rc.2**, which predates alpha.1
  (0.1.1-rc.2 < 0.1.2-alpha.1) and therefore does **not** export `useConversation`.
- Because v0.9.7 *is* distributed on the mirror (ls-remote line 14), the install resolves and
  succeeds — then the slot entry calls the missing host hook at mount and throws
  `TypeError: useConversation is not a function`. This is a **static API/version mismatch baked into
  the artifact**, which is why restarting dsh cannot help: no runtime state is involved.
- **Compatibility direction:** the plugin artifact is built *forward* — v0.9.7 requires a **newer**
  DSH (≥ 0.1.2-alpha.1) than the consumer's 0.1.1-rc.2. The remedy direction is therefore
  **downward on the plugin side** (pin an older, rc-line plugin), because the runtime side is frozen
  and cannot move up.
- The routing defect itself: the README offers one "default install command" pointing at the newest
  tag, with no compatibility matrix and no install-time gate — so a consumer on the rc line is
  silently routed to an alpha-only build.

## 3. Exact remedy for the consumer right now (runtime stays 0.1.1-rc.2)

Route the install to the plugin line that targets the consumer's runtime. Per `compat-table.md`
(line 5), that is **v0.9.3** (verified on 0.1.1-rc.1; rc.2 is rc.1 + additive image preprocessing,
so v0.9.3 is compatible with rc.2):

```bash
dsh plugin --profile web add '@org/dsh-ui-progress@github:public-org/dsh-ui-progress#v0.9.3'
```

**Distribution caveat (must be fixed alongside, or this command repeats attempt 1):** the mirror
listing shows **v0.9.3 is itself not distributed** — v0.9.2–v0.9.6 are missing from
`ls-remote-tags.txt`, the same defect that broke v0.9.5. So the v0.9.3 pin above needs one of these
to actually resolve today, none of which touch the consumer's frozen runtime:

1. **Maintainer pushes the tag (fastest, one command, no code change):**
   ```bash
   git push public refs/tags/v0.9.3   # and mirror2
   ```
   then the consumer runs the v0.9.3 command above. (Commits are already on the mirror — `main` is
   force-synced every release — only the tag ref is missing.)
2. **Consumer installs the v0.9.3 commit directly by SHA** (the SHA is reachable on the mirror via
   the synced `main` history even though the tag ref is absent):
   ```bash
   dsh plugin --profile web add '@org/dsh-ui-progress@github:public-org/dsh-ui-progress#<commit-sha-of-v0.9.3>'
   ```
   The SHA comes from the release origin's `v0.9.3` tag / release notes.
3. **Zero-maintainer-action fallback:** the newest *distributed* pre-alpha.1 tag is **v0.9.1**
   (v0.9.7 is the migration point to the alpha.1 API, so v0.9.1 still uses the rc-era client API
   and is expected to run on 0.1.1-rc.2):
   ```bash
   dsh plugin --profile web add '@org/dsh-ui-progress@github:public-org/dsh-ui-progress#v0.9.1'
   ```
   Caveat: v0.9.1 is not the compat-table-verified build for the rc line (v0.9.3 is); confirm it
   still carries the features the consumer needs, and treat it as a stopgap until the v0.9.3 tag is
   distributed.

What **not** to do: do not keep v0.9.7 (it requires the frozen-out 0.1.2-alpha.1 runtime), and do not
"fix" this by upgrading the consumer's dsh — that is exactly what the production freeze forbids.

## 4. Maintainer-side fix so both defects cannot recur

### 4a. Release tooling (fixes tag distribution — attempt 1)

1. **Push tags with every release sync.** Change the sync loop so the release tag travels with the
   branch (create the tag *before* the sync runs):
   ```bash
   for remote in origin public mirror2; do
     git push --atomic --follow-tags "$remote" HEAD:main   # propagates the release tag too
   done
   ```
2. **Add a post-release verification gate** that fails the release if any mirror is missing the tag
   or the README's pinned ref:
   ```bash
   for url in <origin-url> https://github.com/public-org/dsh-ui-progress.git <mirror2-url>; do
     git ls-remote --tags "$url" | grep -F "refs/tags/${TAG}" \
       || { echo "FATAL: tag missing on $url"; exit 1; }
   done
   # plus: resolve the ref pinned by the README's install command on every mirror
   ```
   Tag presence on all mirrors must be automated and asserted — never left to manual pushes.
3. **Never publish a README pin before the tag is verified on all mirrors** (CI check: parse the
   install command out of the README, `git ls-remote` the pinned ref against each mirror, fail on
   miss). This is what turned a silent pipeline gap into the consumer's attempt-1 outage.

### 4b. Docs (fixes version routing — attempt 2)

1. **Replace the single "newest tag" default install command with a compatibility routing table**
   in the README, next to the install instructions, and tell users to select by their
   `dsh --version` output — never by "latest":

   | Your dsh runtime | Install this plugin tag |
   |---|---|
   | `0.1.1-rc.x` (incl. rc.2) | `#v0.9.3` |
   | `0.1.2-alpha.1` and newer | `#v0.9.7` |

   with the concrete commands spelled out (including the frozen-runtime rc line), and keep the
   "rc.2 = rc.1 + additive" note so rc.2 consumers know v0.9.3 covers them.
2. **Make incompatibility fail at install time, not at slot mount.** Add a machine-checkable runtime
   constraint to the plugin manifest (e.g. an `engines`/`dsh` field: `">=0.1.2-alpha.1"` for v0.9.7
   builds, `"~0.1.1"` for the rc line) and have the installer validate the consumer's
   `dsh --version` against it — refusing with a clear "this plugin version targets DSH X; use tag Y"
   error instead of shipping a bundle that throws `useConversation is not a function` in the browser.
3. **Keep the compat table authoritative and adjacent to the install command**, and require it to be
   updated in the same change that cuts a version bump, so "newest tag" can never again silently
   mean "only for the newest runtime."

---

## Summary — two failures, two distinct defects

| Stage | Symptom | Root cause | Evidence |
|---|---|---|---|
| Attempt 1 (`#v0.9.5`) | pnpm fails immediately at resolution | **Tag distribution defect**: release sync pushes only `HEAD:main`, never tags; v0.9.5 (v0.9.2–v0.9.6) never reached the public mirror | `ls-remote-tags.txt` (gap v0.9.1→v0.9.7) + `sync-script.sh` (branch-only push, no verification) |
| Attempt 2 (`#v0.9.7`) | Install OK, slot crashes `useConversation is not a function`, restart no help | **Version routing defect**: newest tag targets `dsh-v0.1.2-alpha.1` (alpha.1 client API / `useConversation` seat); consumer is on `0.1.1-rc.2` which lacks that export. Plugin requires a *newer* runtime than the consumer has | `compat-table.md` (v0.9.7→alpha.1) + `dsh-version.txt` (0.1.1-rc.2) |
| Remedy now | — | Pin the consumer to the rc-line plugin **v0.9.3** (works on rc.2 because rc.2 = rc.1 + additive); ensure the tag is actually distributed (maintainer pushes it / use the v0.9.3 commit SHA; fallback v0.9.1) — runtime untouched | compat table + mirror tag list |
| Maintainer fix | — | Sync script: push `--atomic --follow-tags` + post-release `ls-remote --tags` verification per mirror; README: version→tag routing table, install-time engine constraint, compat table next to install command | — |
