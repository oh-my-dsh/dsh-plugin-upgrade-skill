# JUDGE BRIEF · noskill.S8-release-routing-trap

## Criteria (sealed rubric)
- [missing-mirror-tag] (20pt) Use ls-remote-tags.txt and sync-script.sh to explain that the README-pinned v0.9.5 is absent from the public mirror because the script pushes HEAD:main but not tags. Tie this to attempt 1 resolution failure, rather than guessing a network fault, consumer typo or missing npm package. Mere tag/version mentions earn no credit.
- [runtime-compatibility-direction] (20pt) Use dsh-version.txt (0.1.1-rc.2) and compat-table.md (v0.9.7 targets 0.1.2-alpha.1) to explain attempt 2: a newer-client-API artifact on an older runtime lacks the expected useConversation seat. Successful installation/restarting does not establish API compatibility. Explain the direction rather than only repeating the error.
- [frozen-runtime-remedy] (20pt) Honor the production freeze: select v0.9.3 using its rc.1 verification and the supplied additive rc.2 compatibility note. Notice v0.9.3 is ALSO absent from the mirror listing. Provide the consumer install command pinning #v0.9.3 after maintainer tag publication, or a reachable verified v0.9.3 commit as a conditional alternative. Do not invent a SHA, assume an unreachable commit resolves, require upgrading DSH, or present the absent tag as immediately installable.
- [tag-distribution-repair] (20pt) Propose explicit release-tag distribution to every public mirror, grounded in the branch-only sync script, and verify the documented tags resolve. Non-forced git push <remote> <tag> or --tags are equivalent. Branch synchronization alone is insufficient; a bare --tags keyword does not establish the repair.
- [version-routing-docs] (20pt) Prevent the second defect by routing README install commands according to the consumer DSH version: rc.2 users get the verified v0.9.3 artifact, alpha.1 users can use v0.9.7. Include a runtime version check or explicit compatibility matrix/branches. A single newest-tag default or restarting advice does not satisfy this requirement. Do not generalize support to every untested future alpha release.

## Caps (score ceilings; judge returns each with triggered true/false)
(none)

## Candidate report(s)
#### FILE: S8-release-routing-trap/report.md

# S8 · Release Routing Trap — Diagnosis Report

Prepared from the static evidence pack in `/app/fixture/` (read-only; unmodified). Consumer constraint honored: **production freeze — the dsh runtime stays at 0.1.1-rc.2**, so every remedy below works on that runtime.

---

## 0. Evidence inventory (what the fixture proves)

| Evidence | Key fact |
|---|---|
| `ls-remote-tags.txt` (git ls-remote --tags of github.com/public-org/dsh-ui-progress) | Mirror carries tags v0.1.0 … v0.9.0, v0.9.1, and v0.9.7. **v0.9.2–v0.9.6 are absent — including the v0.9.5 the README pinned, and including v0.9.3.** |
| `sync-script.sh` (release sync excerpt) | After every release the script runs only `git push --force-with-lease "$remote" HEAD:main` for each of `origin public mirror2`. **It pushes the branch, never tags** — no `--tags`, no `refs/tags/*` refspec. |
| `dsh-version.txt` | Consumer runtime: `dsh --version` → **0.1.1-rc.2**. |
| `compat-table.md` | **v0.9.3 ↔ dsh 0.1.1-rc.1** (rc.1 real-boot verified; "rc.2 is rc.1 + image preprocessing (additive)"). **v0.9.7 ↔ dsh-v0.1.2-alpha.1** ("Migrated to the alpha.1 client API (views/legacy projection + useConversation seat)"). |
| Task brief | Attempt 1: `…#v0.9.5` → pnpm failed immediately. Attempt 2: `…#v0.9.7` → install OK, then slot entry crashes in browser with `TypeError: useConversation is not a function`; restart does not help. |

---

## 1. Attempt-1 root cause — why `#v0.9.5` could not resolve

**Release-engineering defect: tag distribution. The release sync tooling never pushes tags to the public mirrors, so the tag the README told consumers to pin does not exist on the mirror they install from.**

Chain of evidence:

1. The install specifier `github:public-org/dsh-ui-progress#v0.9.5` requires git to resolve the ref `v0.9.5` on that exact remote. pnpm failed *immediately* — the signature of ref-resolution failure, not of a slow/blocked network or bad credentials (those produce timeouts/auth errors, and the same URL + command shape later succeeded for attempt 2).
2. `ls-remote-tags.txt` proves the remote is reachable and lists its complete tag set: v0.9.5 is **not** in it. Neither are v0.9.2, v0.9.3, v0.9.4, v0.9.6 — the mirror jumps from v0.9.1 straight to v0.9.7.
3. `sync-script.sh` explains the gap structurally: the post-release sync pushes only `HEAD:main` to `origin`, `public`, `mirror2`. **Tags are simply never part of automated distribution.** The contiguous old tags (v0.1.0–v0.9.1) predate this process or were pushed by hand; v0.9.7 most plausibly appeared via an ad-hoc manual push when the README was bumped. Every release cut while this script was the only sync path (v0.9.2–v0.9.6, including the README-pinned v0.9.5) never reached the mirrors.
4. Therefore the defect is entirely maintainer-side: **README pin ⇄ mirror tag set diverged** because release tooling distributes the branch but not the tags, and nothing verifies after a release that the pinned ref actually resolves on each mirror.

Ruled out by evidence, not guessed away: consumer network (attempt 2 used the same host and succeeded), command syntax (identical shape succeeded with `#v0.9.7`), typo in tag name (v0.9.5 is a real release per the README/compat history — it is missing from the mirror's tag set, i.e. undistributed, and the ls-remote shows the mirror's tag set is systemically incomplete, not merely missing one tag).

---

## 2. Attempt-2 root cause — why `#v0.9.7` installs but crashes

**Release-engineering defect: version routing. v0.9.7 was built against a *newer* DSH client API than the consumer's runtime provides, and nothing — metadata, docs, or loader — routes consumers to the artifact matching their runtime.**

Compatibility direction, stated explicitly:

- Artifact **v0.9.7 targets dsh-v0.1.2-alpha.1** (compat-table: "Migrated to the alpha.1 client API (views/legacy projection + useConversation seat)").
- Consumer runtime is **0.1.1-rc.2** (dsh-version.txt) — *older* than the artifact's target.
- So the plugin is **ahead of** the host: v0.9.7's slot entry imports/calls `useConversation`, an API surface that exists only in the 0.1.2-alpha.1 client. The rc.2 host does not export it, so the imported binding is not a function and the slot entry throws `TypeError: useConversation is not a function` on first render.

Why the two stages behaved differently:

- **Install succeeded** because installation is pure git-ref resolution plus package fetch: the v0.9.7 tag *is* on the mirror (attempt 1's defect is tag-specific), and the package declares no machine-checkable runtime constraint (no peerDependency/engine/manifest gate on the dsh version), so pnpm/dsh had nothing to reject.
- **Runtime crashed, and restarting cannot help**, because the failure is a static API mismatch baked into the artifact — a missing host export is deterministic, not a corrupted state or a stale process.
- Note also what v0.9.7 is *not*: it is not "too old for the runtime". The compat table's rc.2 remark ("rc.2 = rc.1 + image preprocessing, additive") shows the runtime moved forward only additively; the break is that the *artifact* jumped to the alpha.1 API generation while the consumer is contractually frozen one generation behind.

The README's "bump the pin to the newest tag" advice is the routing defect in docs form: newest tag ≠ compatible tag. Version selection must be a function of the consumer's runtime, and today no layer (metadata, README matrix, install-time check) performs that routing.

---

## 3. Exact remedy for the consumer right now (runtime stays 0.1.1-rc.2)

The compatible artifact for a 0.1.1-rc.2 host is **v0.9.3**: it is real-boot verified against rc.1, and rc.2 differs from rc.1 only by *additive* image preprocessing, so nothing v0.9.3 relies on was removed or changed. Do **not** use v0.9.7 (needs 0.1.2-alpha.1) and do **not** use `#main` or any moving alias (mirrors' `main` is force-pushed to newest development state, i.e. the incompatible alpha.1-generation code).

One prerequisite, because attempt-1's defect also swallowed v0.9.3 (the ls-remote shows it absent from the public mirror):

1. **Maintainer (minutes, no consumer-side change, no freeze violation)** — publish the missing tag from the canonical repo to both public mirrors, e.g.:
   ```bash
   git push public refs/tags/v0.9.3
   git push mirror2 refs/tags/v0.9.3
   # verify: git ls-remote --tags <mirror-url> | grep v0.9.3
   ```
2. **Consumer** — install pinned to the compatible tag:
   ```bash
   dsh plugin --profile web add '@org/dsh-ui-progress@github:public-org/dsh-ui-progress#v0.9.3'
   ```
   (Same command against the second mirror URL if preferred.)

If the consumer's existing broken v0.9.7 install must be cleared first, remove/re-add via the same `dsh plugin --profile web` surface; the pin above is the operative fix. Fallback if tag re-push is somehow impossible: pin the immutable commit SHA that v0.9.3 points to in the canonical repo (`…@github:public-org/dsh-ui-progress#<sha>`) after the maintainer publishes/communicates it — a SHA is force-push-proof even though mirror `main` is not.

---

## 4. Maintainer-side fix so neither defect can recur

### 4a. Release tooling (fixes tag distribution — attempt-1 class)
1. **Push tags in the sync script**: alongside `HEAD:main`, push the released tag to every mirror, e.g.
   `git push --force-with-lease "$remote" HEAD:main "refs/tags/${RELEASE_TAG}:refs/tags/${RELEASE_TAG}"`
   (or `git push "$remote" --tags` for full backfill, run once now to restore v0.9.2–v0.9.6).
2. **Post-release verification gate**: after syncing, run `git ls-remote --tags` against *each* mirror and fail the release unless the just-cut tag resolves on all of them. This converts "consumer discovers the tag is missing" into "release pipeline refuses to complete".
3. **Stop force-pushing `main` on public mirrors** (or mirror only immutable release refs): `--force-with-lease HEAD:main` rewrites public history, invalidates any commit-SHA pins consumers hold, and makes `main` unusable as an install source. Prefer fast-forward-only branch sync plus immutable tags as the supported pin surface.
4. **Single source of truth for "what is released"**: cut tags/branches from one release job that fans out to origin + both mirrors atomically, rather than per-mirror ad-hoc pushes (which is how v0.9.7 alone ended up on the mirror while v0.9.2–v0.9.6 did not).

### 4b. Compatibility routing + docs (fixes version routing — attempt-2 class)
1. **Machine-checkable runtime gating**: declare the supported dsh range in the plugin package metadata (e.g. `peerDependencies`/`engines` on `@deepseek-ai/dsh`: v0.9.x-rc line → `>=0.1.1-rc.1 <0.1.2-0`; v0.9.7 line → `>=0.1.2-alpha.1`) and/or a dsh plugin-manifest minimum-runtime field if the runtime honors one. Goal: an incompatible pair must fail at install time with a version message, never as a `TypeError` in the browser.
2. **Publish a compatibility matrix in the README** (the compat-table already exists internally): "dsh 0.1.1-rc.x → install `#v0.9.3`; dsh 0.1.2-alpha.1+ → install `#v0.9.7`", with the install commands shown per row.
3. **Never pin "newest tag" as the default install command.** The README's default snippet must be the *compatibility-routed* pin, and a docs CI check should extract every tag referenced in the README and verify it resolves on every public mirror before the README change merges (this single check would have caught both the v0.9.5 pin and the missing v0.9.3).
4. **Maintain a release line for frozen consumers**: while any supported dsh generation is in the field, keep a maintenance branch/tag line (e.g. 0.9.x-rc) that receives fixes without adopting the next-generation client API, and state in release notes which runtime generation each release targets.
5. **Optional runtime fast-fail**: have the slot entry check for required host APIs at load and throw `dsh-ui-progress v0.9.7 requires dsh >= 0.1.2-alpha.1 (found 0.1.1-rc.2); install #v0.9.3 for your runtime` — turning any future routing miss into a self-explaining error.

---

## 5. One-paragraph summary

Attempt 1 failed because the release sync script distributes only `main` and never tags, so the README-pinned `v0.9.5` does not exist on the public mirror (ls-remote proves the gap: v0.9.1 → v0.9.7). Attempt 2 "succeeded" at install — the v0.9.7 tag happens to be on the mirror and nothing gates compatibility at install time — then crashed because v0.9.7 targets the dsh 0.1.2-alpha.1 client API (`useConversation` seat) while the consumer is frozen on 0.1.1-rc.2, one API generation behind; the artifact is ahead of the host, deterministically, so restarts cannot help. The immediate remedy is to re-push the missing **v0.9.3** tag to both mirrors and have the consumer install `'@org/dsh-ui-progress@github:public-org/dsh-ui-progress#v0.9.3'`, the artifact verified against the rc.1 API surface that rc.2 only additively extends. Durable fixes: sync + verify tags on every mirror per release, stop force-pushing public `main`, and route versions via a published compat matrix plus machine-checkable runtime constraints instead of a "newest tag" README pin.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.