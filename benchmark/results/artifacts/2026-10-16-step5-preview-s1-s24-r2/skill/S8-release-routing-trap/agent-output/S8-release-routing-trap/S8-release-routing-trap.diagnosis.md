# S8 · Release-Routing Trap — Release-Engineering Diagnosis

**Scope:** read-only diagnosis of a static evidence pack (`fixture/`). Consumer runs a **production
freeze** — the dsh runtime cannot be upgraded — so every remedy below works on the consumer's
current runtime (`0.1.1-rc.2`).

## TL;DR — two failures, two distinct root causes

| Attempt | Symptom | Root-cause class | One-line cause |
|---|---|---|---|
| 1 · `#v0.9.5` | pnpm fails to resolve immediately | **Tag distribution** | The mirror never received tags **v0.9.2–v0.9.6**; the release sync script pushes only `HEAD:main`, never tags. v0.9.5 exists on the canonical repo but not on the public mirror. Not a network/command problem. |
| 2 · `#v0.9.7` | installs, then `TypeError: useConversation is not a function` in the slot entry | **Version routing** | v0.9.7 is a **newer-cohort artifact** targeting DSH `0.1.2-alpha.1` (the client API that introduced `useConversation`). The consumer runs `0.1.1-rc.2`, which has no `useConversation`. "Newest tag" ≠ "compatible tag." |

**Remedy:** pin the rc.x-compatible plugin **v0.9.3** (targets `0.1.1-rc.1`; `rc.2 = rc.1 + additive
image preprocessing`, so it runs on the consumer's `0.1.1-rc.2`). **The trap:** v0.9.3 is *also*
missing from the mirror (same distribution defect that hid v0.9.5), so it must be restored to the
mirror (or pulled from the canonical origin) before the pin resolves.

---

## Evidence used (all from `fixture/`, read-only)

| File | Fact it establishes |
|---|---|
| `dsh-version.txt` | Consumer runtime = **`0.1.1-rc.2`** (`$ dsh --version`) |
| `ls-remote-tags.txt` | Mirror `public-org/dsh-ui-progress` tags: v0.1.0, v0.2.0, v0.3.0, v0.4.0, v0.5.0, v0.5.1, v0.6.0, v0.7.0, v0.8.0, **v0.9.0, v0.9.1**, …, **v0.9.7**. **v0.9.2 / v0.9.3 / v0.9.4 / v0.9.5 / v0.9.6 are absent.** |
| `compat-table.md` | Plugin↔DSH matrix: **v0.9.3 → `@deepseek-ai/dsh@0.1.1-rc.1`** (rc.1 real-boot verified; rc.2 additive); **v0.9.7 → `dsh-v0.1.2-alpha.1`** (migrated to the alpha.1 client API: views/legacy projection + `useConversation` seat) |
| `sync-script.sh` | Post-release sync runs `git push --force-with-lease "$remote" HEAD:main` for `origin public mirror2` — **it pushes the branch, never the tags** |

---

## 1. Attempt-1 root cause — tag distribution (why `#v0.9.5` could not resolve)

The README's default command pinned `#v0.9.5`, but `git ls-remote --tags` on the mirror
(`ls-remote-tags.txt`) shows **no `v0.9.5`** — the 0.9.x tags jump straight from `v0.9.1` to
`v0.9.7`. The whole band **v0.9.2, v0.9.3, v0.9.4, v0.9.5, v0.9.6 is missing** from the mirror.

The release-engineering defect is in `sync-script.sh`: after every release it runs

```bash
for remote in origin public mirror2; do
  git push --force-with-lease "$remote" HEAD:main   # branch only
done
```

This propagates the **branch** to every mirror but **never pushes tags** (no `git push --tags`, no
per-tag push). Tags created through the normal release pipeline therefore land on the canonical
`origin` repo only and are **never distributed to the two public mirrors**. The observed evidence —
a contiguous v0.9.2–v0.9.6 gap flanked by present tags (v0.9.0/v0.9.1 older, v0.9.7 newer) — is the
fingerprint of exactly this: the tags produced under the sync-script regime were dropped, while the
flanking tags predate/postdate it or were pushed by hand.

`v0.9.5` is one such dropped tag. pnpm/git resolves a GitHub `#tag` ref against the **mirror's**
tag list, finds nothing, and fails to resolve — immediately, before any install work. This is a
**release/tag-distribution defect on the maintainer side, not a consumer network or typo problem.**
(The tag does exist on the canonical repo — the compat table and the original README both treat
v0.9.3/v0.9.5 as real releases — so it was *created*; it was *distributed* incorrectly.)

---

## 2. Attempt-2 root cause — version routing (why the newest tag installed but crashed)

Bumping the README to the **newest** tag `#v0.9.7` "fixed" resolution because v0.9.7 *is* on the
mirror — but it is the wrong **cohort**.

**Compatibility direction (which artifact targets which DSH version), from `compat-table.md`:**

- **v0.9.3 → DSH `0.1.1-rc.1`** (rc.1 real-boot verified; **rc.2 = rc.1 + additive image
  preprocessing**, so v0.9.3 runs unchanged on `0.1.1-rc.2`).
- **v0.9.7 → DSH `0.1.2-alpha.1`** — "Migrated to the alpha.1 client API (views/legacy projection +
  **useConversation** seat)."

**Tie to the consumer's runtime (`0.1.1-rc.2`):** the consumer sits on the **0.1.1** line, one full
minor behind the **0.1.2-alpha.1** line that v0.9.7 was built for. v0.9.7's slot entry calls
`useConversation`, a hook that exists in the alpha.1 client API but **does not exist in
`0.1.1-rc.2`**. The imported/called symbol is `undefined`, so rendering the slot entry throws
`TypeError: useConversation is not a function`. Because this is an **API-surface mismatch baked into
the v0.9.7 build** — not transient runtime state — restarting dsh cannot help, exactly as reported.

**The routing error:** plugin version and DSH host version are **two independent version lines**;
"the newest plugin tag" routes to the **newest DSH cohort**, which the consumer's frozen runtime
predates. The consumer needed to go **down** to the rc.x-compatible plugin (v0.9.3), not **up** to the
alpha-cohort plugin (v0.9.7). (This is the same client-API seat drift across the rc.2→alpha.1
corridor documented in the plugin-upgrade skill's R-02 cross-cohort / R-11 client-API ledger, and the
dual-cohort record in example 04.)

---

## 3. Exact remedy for the consumer right now (works under the freeze)

**Pin v0.9.3 — the version certified for the `0.1.1-rc.x` line — not v0.9.7:**

```bash
dsh plugin --profile web add '@org/dsh-ui-progress@github:public-org/dsh-ui-progress#v0.9.3'
```

v0.9.3 targets `0.1.1-rc.1` and rc.2 is additive over rc.1, so it runs on the consumer's
`0.1.1-rc.2` **with no runtime upgrade** — satisfying the production freeze. Do **not** install
v0.9.7 (wrong cohort → crash) and do **not** upgrade the runtime.

**The trap (this is the part that connects both failures):** v0.9.3 sits in the **v0.9.2–v0.9.6**
band that the sync script never distributed, so **v0.9.3 is not on the mirror right now either** —
the *same* distribution defect that blocked v0.9.5 also blocks the correct fix. As of now there is
**no mirror tag that is both certified-compatible with 0.1.1-rc.2 and actually present**
(v0.9.0/v0.9.1 are present but are **not** certified for rc.x by the compat table — do not assume
compatibility the table doesn't state). So the remedy is two-handed:

1. **Maintainer restores the tag (immediate, one command):**
   ```bash
   git push origin v0.9.3
   for r in public mirror2; do git push "$r" v0.9.3; done
   # ideally also backfill the rest of the band + v0.9.5, then verify:
   git ls-remote --tags <each-mirror> | grep v0.9.3
   ```
2. **Then the consumer runs the v0.9.3 command above.**

**No-wait workarounds (only if applicable to this consumer):**
- If the consumer can reach the **canonical origin repo** (the sync script's `origin`, which retains
  all tags), install v0.9.3 directly from it — but the origin repo URL is **not in this evidence
  pack**, and the brief implies only the two public mirrors are consumer-facing, so this may not be
  available to them.
- Pin the **v0.9.3 commit SHA** from the mirror's `main` history (the pipeline did push every
  release's HEAD to main, so the v0.9.3 commit is likely an ancestor of v0.9.7). Obtain the SHA via
  `git ls-remote`/`git log` and pin `#<sha>`. Not verifiable from this static pack — treat as a
  fallback, not the primary remedy.

---

## 4. Maintainer-side fix (so both defects cannot recur)

### A · Release tooling — make tag propagation first-class and verified
1. **Fix `sync-script.sh` to push tags, not just `HEAD:main`:**
   ```bash
   for remote in public mirror2; do
     git push --force-with-lease "$remote" HEAD:main
     git push --tags "$remote"                 # distribute annotated tags too
   done
   ```
   Prefer pushing the specific release tag and **verifying it landed** on every mirror:
   ```bash
   git push "$remote" "refs/tags/${RELEASE_TAG}"
   git ls-remote --tags "$remote" | grep -q "refs/tags/${RELEASE_TAG}" \
     || { echo "tag ${RELEASE_TAG} MISSING on $remote"; exit 1; }
   ```
2. **Add a release gate (CI)** that fails the release if the new tag — and every tag referenced by the
   README/docs — does not resolve on **both** mirrors via `git ls-remote --tags`. Convert the silent
   E404/ETARGET the consumer hit into a hard, early failure. (Same discipline as the skill's R-08
   install-channel verification: confirm the target resolves on the channel before declaring success.)
3. **Backfill now:** push the missing v0.9.2–v0.9.6 band (at minimum v0.9.3 and v0.9.5) to both
   mirrors and re-verify with `git ls-remote --tags`.

### B · Version routing — never let "newest tag" route a stable host onto a newer cohort
4. **Adopt the dual-cohort model** (skill example 04 / R-02): ship **one artifact that resolves the
   cohort surface at runtime** and works on both rc.x and alpha.x hosts, or — if the `useConversation`
   seat change cannot be made safely dual-cohort — publish **clearly separated per-cohort plugin
   versions**. Never let a single "latest" pointer drift to an alpha-cohort build for stable hosts.
5. **Channel discipline (R-04 dist-tag rule):** publish alpha-cohort adaptations under a
   **prerelease/`alpha` channel** and keep the stable-host-compatible line on the default channel,
   so stable-host users are not auto-upgraded onto incompatible peers. On the GitHub-tag track,
   mirror this with a distinctly named stable tag/line separate from the alpha-cohort tag.
6. **Declare the DSH cohort in the manifest** (peer/engines range, e.g. `@deepseek-ai/dsh`
   `^0.1.1-rc.1` for the rc line, `^0.1.2-alpha.1` for the alpha line) so an incompatible host is
   **rejected at install/startup with a clear message** instead of crashing with
   `useConversation is not a function`. (Cf. R-08 peer-floor prerelease semantics and the DSH
   peer-range enforcement noted in the 0.1.7-rc.1 cards.)

### C · Docs — make the install command cohort-aware and self-verifying
7. **Remove the single pinned "default install" tag.** It pinned `#v0.9.5` (attempt 1) then
   `#v0.9.7` (attempt 2) — both wrong for different reasons. Lead with the **compatibility table**
   and give a **per-cohort install snippet**:
   - DSH `0.1.1-rc.x` → `dsh plugin --profile web add '@org/dsh-ui-progress@github:public-org/dsh-ui-progress#v0.9.3'`
   - DSH `0.1.2-alpha.x` → `dsh plugin --profile web add '@org/dsh-ui-progress@github:public-org/dsh-ui-progress#v0.9.7'`
   - Instruction: "Run `dsh --version` first and pick the tag whose DSH column matches. The newest
     tag is **not** necessarily the compatible one."
8. **Keep the compat table as the single source of truth** and **auto-generate** the README install
   snippet (and any `latest`/default pointer) from it or from the manifest's declared cohort, so docs
   cannot drift from the matrix again. Add a short "install pitfalls" note covering the mirror
   tag-distribution dependency and the cohort-routing rule.

---

## Verification the maintainer should run after the fix
- `git ls-remote --tags <each mirror>` lists v0.9.3 and v0.9.5 (and the rest of the band).
- A scratch profile on **`0.1.1-rc.2`** installs `#v0.9.3`, cold-boots, and the slot entry renders
  with no `useConversation` error (real mount, not just HTTP 200).
- A scratch profile on **`0.1.2-alpha.1`** installs `#v0.9.7` and renders correctly.
- The README's per-cohort snippet matches the compat table (ideally generated from it).

*Diagnosis is static and read-only; no fixture files were modified and nothing was executed,
installed, or published.*
