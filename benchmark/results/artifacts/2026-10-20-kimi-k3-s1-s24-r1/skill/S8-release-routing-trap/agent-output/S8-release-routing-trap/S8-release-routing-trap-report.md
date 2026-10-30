# S8 · Release Routing Trap — Release-Engineering Diagnosis

**Mode:** plugin-upgrade skill, Mode A · inspect (read-only). Fixture untouched; this report is the only write.

## Evidence used (fixture, static)

- `fixture/ls-remote-tags.txt` — mirror tag listing: `v0.1.0 … v0.9.1, v0.9.7` — **no `v0.9.5`** (and no `v0.9.2`–`v0.9.6`).
- `fixture/sync-script.sh` — release sync: `git push --force-with-lease "$remote" HEAD:main` for each mirror — **pushes only the `main` branch; no `--tags`, no tag refspec, no per-tag push**.
- `fixture/compat-table.md` — plugin v0.9.3 ↔ `@deepseek-ai/dsh@0.1.1-rc.1` ("rc.2 is rc.1 + image preprocessing (additive)"); plugin v0.9.7 ↔ `dsh-v0.1.2-alpha.1` ("Migrated to the alpha.1 client API (views/legacy projection + useConversation seat)").
- `fixture/dsh-version.txt` — consumer runtime: **dsh 0.1.1-rc.2**.
- Task brief — attempt-2 crash: `TypeError: useConversation is not a function`; restart did not help (rules out a stale-bundle flake; this is a deterministic API mismatch).

## 1. Attempt-1 root cause: `#v0.9.5` cannot resolve

The install `dsh plugin --profile web add '@org/dsh-ui-progress@github:public-org/dsh-ui-progress#v0.9.5'` asks pnpm to resolve the **git tag `v0.9.5`** on the mirror. That tag does not exist on the mirror (`ls-remote --tags` jumps from `v0.9.1` straight to `v0.9.7`), so pnpm fails immediately with a git ref resolution error — before any network or registry question arises.

**Release-engineering defect — tag distribution, not version content:** the maintainer's release sync script pushes only `HEAD:main` to each mirror. Tags are never pushed (`git push <remote> main` does not carry tags), so whatever intermediate tags existed on the primary remote (`v0.9.2`–`v0.9.6`, including the README-pinned `v0.9.5`) never reached the public mirrors. Only `v0.9.7` is present — most likely pushed once by hand, or created on the mirror side. The README pinned a tag the mirrors never received: a **tag-distribution gap in the release tooling**, proven by the tag listing + sync script, not by any guess about the consumer's network or command syntax.

## 2. Attempt-2 root cause: newest tag installs, then crashes at runtime

**Compatibility direction:** plugin **v0.9.7 targets DSH 0.1.2-alpha.1** — per the compat table it was migrated *to* the alpha.1 client API and consumes the new **`useConversation` seat** (a session-kit injected hook introduced on the 0.1.2-alpha.1 client surface). The consumer's runtime is **DSH 0.1.1-rc.2**, whose client injection surface predates that seat: the injected props object has no `useConversation`, so the slot entry calls a missing function and React render throws `TypeError: useConversation is not a function`.

This is a **forward-migration artifact running on an older host** (plugin artifact newer than the runtime it runs on). Skill reference `references/v0.1.2-alpha.1.md` documents exactly this API window (views/legacy projection; `useConversation` seat; field note naming dsh-ui-progress in the affected plugin set). GitHub-spec installs do not enforce the DSH peer range on this runtime (peer enforcement arrives later, per the 0.1.7-rc.1 card DSH-0.1.7-R1 — card ID only), so nothing stops the incompatible install; the failure surfaces only at render. A host restart cannot help — the missing export is absent from the 0.1.1-rc.2 client bundle by design, not by caching.

Distinct cause from attempt 1: attempt 1 was **where the release lives** (tag missing on the mirror); attempt 2 is **which runtime the release targets** (artifact routed to a host outside its compatibility corridor).

## 3. Exact remedy for the consumer right now (runtime frozen at 0.1.1-rc.2)

Install the newest plugin tag that targets the consumer's DSH line — **v0.9.3**, which the compat table marks rc.1-verified and explicitly covers rc.2 ("rc.2 is rc.1 + image preprocessing (additive)"):

```
dsh plugin --profile web add '@org/dsh-ui-progress@github:public-org/dsh-ui-progress#v0.9.3'
```

`v0.9.3` is present on the mirror (per `ls-remote`) and is the last tag built against the 0.1.1 client API. (If the old row lingers, remove the v0.9.7 row from the web profile composition first, then add the command above; verify the profile resolves to v0.9.3 and the slot entry mounts.) When the production freeze lifts and the host can move to `@deepseek-ai/dsh@0.1.2-alpha.1` or later, upgrade the host first (external pinned install, host fully stopped), then re-pin the plugin to `#v0.9.7`.

## 4. Maintainer-side fixes so neither defect recurs

**Release tooling (fix the tag-distribution gap):**
- Push tags explicitly on every release, to every mirror: `git push <remote> main && git push <remote> --tags` (or `git push --follow-tags`), keeping `--force-with-lease` off tags — never force-push tags; if a tag must move, delete-and-repush deliberately and cut a new patch tag instead.
- Add a post-release verification gate in the sync script: for each mirror run `git ls-remote --tags <mirror>` and fail the release if the just-cut tag is absent; additionally smoke-test the README's exact install command against each mirror in CI before publishing the README bump.
- Make the README install pin machine-generated from the release tag (single source of truth) so docs cannot pin a tag that was never distributed.

**Docs / version routing (fix the compatibility trap):**
- Publish and maintain the plugin↔DSH compatibility table as the install contract; per release, state the minimum/exact DSH version in the README next to the install command ("v0.9.7 requires dsh ≥ 0.1.2-alpha.1; on dsh 0.1.1-rc.x use #v0.9.3").
- Declare the DSH peer range in the plugin package (e.g. `peerDependencies` on `@deepseek-ai/dsh` — and for multi-cohort support a range like `^0.1.1 || ^0.1.2-alpha.1` including prereleases) so newer hosts with peer enforcement refuse mismatched installs instead of crashing at render; on older hosts the table remains the guard.
- Cut compatibility lines deliberately: keep a 0.1.1-targeted patch line (0.9.3.x) for frozen runtimes, and document it, so "newest tag" is never the only installable path.

## Report structure (per skill)

- **Pre-existing:** not collected (read-only Mode A; no baseline run permitted).
- **Completed:** both failures attributed to distinct root causes from fixture evidence (tag distribution vs version routing); remedy compatible with the consumer's frozen runtime; maintainer-side tooling + docs fixes.
- **Skipped:** no install/build/runtime validation — fixture is static and read-only, migrations/installations prohibited by the brief.
- **Pending/residual risk:** how `v0.9.7` alone reached the mirrors is inferred (manual/tag-side push), not directly evidenced; v0.9.2–v0.9.6 existence on the primary remote is inferred from the README pin.
- **Rollback:** none required — no writes were made to the fixture; the consumer remedy is itself the rollback to the last compatible line.
- **Recommendations:** adopt the README pin-from-tag generation and per-mirror ls-remote release gate as release-blocking checks.
