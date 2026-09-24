# S8 · Release Routing Trap — Diagnosis Report

Task: release-engineering diagnosis from the static evidence pack (Mode A · inspect, read-only).
Evidence used: `ls-remote-tags.txt`, `dsh-version.txt`, `compat-table.md`, `sync-script.sh`, task brief.

## 1. Attempt-1 root cause: `#v0.9.5` could not resolve

**Defect: the mirror-sync release tooling pushes branches but never pushes tags, so intermediate release tags never reached the public mirror the consumer installs from.**

Evidence:

- `ls-remote-tags.txt` (the consumer-facing mirror `public-org/dsh-ui-progress`) jumps straight from `v0.9.1` to `v0.9.7`. `v0.9.5` — the tag the README's default install command pins — is absent, along with `v0.9.2`–`v0.9.6`.
- `sync-script.sh`, which "runs after every release, for each mirror", executes only:
  ```bash
  git push --force-with-lease "$remote" HEAD:main
  ```
  This pushes the `main` branch ref only. It never pushes `refs/tags/*` (`--follow-tags`, `--tags`, or `refs/tags/v*` refspecs are all missing). Tags land on `origin` when the release is cut, but the consumer-facing mirrors never receive them — except apparently `v0.9.7`, which must have reached the mirror by some other path (e.g. pushed manually or mirrored once), which is exactly why the two failures present so differently.

So pnpm failed immediately on attempt 1 because `github:public-org/dsh-ui-progress#v0.9.5` asks git to resolve a tag ref that does not exist on that remote — a deterministic resolution failure caused by incomplete tag distribution in the release tooling, not the consumer's network or command.

## 2. Attempt-2 root cause: `#v0.9.7` installs but crashes in the browser

**Defect: version routing. `v0.9.7` is built against the DSH 0.1.2-alpha.1 client API, but the consumer's runtime is 0.1.1-rc.2. The direction of incompatibility is: newer plugin artifact → newer DSH host than the consumer has.**

Evidence:

- `dsh-version.txt`: consumer runs `dsh --version` → **0.1.1-rc.2** (production freeze; cannot upgrade).
- `compat-table.md`:
  - `v0.9.3` ↔ dsh **0.1.1-rc.1** ("rc.1 real-boot verified; rc.2 is rc.1 + image preprocessing (additive)") → works on the consumer's rc.2 runtime.
  - `v0.9.7` ↔ **dsh-v0.1.2-alpha.1**, "Migrated to the alpha.1 client API (views/legacy projection + **useConversation** seat)".
- The crash `TypeError: useConversation is not a function` in the slot entry is the runtime signature of exactly that mismatch: the plugin's client bundle calls the `useConversation` seat introduced/renamed in the 0.1.2-alpha.1 client API (per the skill's rc.1→alpha.1 corridor cards, the client session-aggregation / conversation seat surface changed on that edge). On 0.1.1-rc.2 the injected client runtime does not expose that export, so the hook resolves to `undefined` and the call throws at registration time — before any UI renders, hence restarting dsh cannot help (the failure is static bundle-vs-host incompatibility, not transient state).

Note the routing trap: because `v0.9.5` was missing from the mirror, the maintainer "fixed" the README by bumping to the newest tag `v0.9.7` — the only other recent tag present — without checking that `v0.9.7` targets a *newer* DSH than the README's default audience. Two independent defects chained into one two-stage failure.

## 3. Remedy for the consumer right now (works on dsh 0.1.1-rc.2, no runtime upgrade)

Install the corridor-matched version, `v0.9.3`, which exists on the mirror and is verified against 0.1.1-rc.1 (rc.2 is additive on that line):

```
dsh plugin --profile web add '@org/dsh-ui-progress@github:public-org/dsh-ui-progress#v0.9.3'
```

Then restart dsh / hard-refresh the browser so the old broken `v0.9.7` bundle is not served from cache. (If `v0.9.3`'s exact commit is preferred, pin the full commit SHA instead of the tag.) Do **not** use `v0.9.7` until the runtime is upgraded to ≥ 0.1.2-alpha.1.

## 4. Maintainer-side fixes so both defects cannot recur

**Release tooling (defect 1 — tag distribution):**

1. Push tags in the sync script, per mirror, e.g.:
   ```bash
   git push --force-with-lease "$remote" HEAD:main
   git push "$remote" --tags
   ```
   (or `--follow-tags` with annotated tags for the release commits).
2. Add a post-sync verification gate that fails the release if any mirror is missing a tag that origin has, e.g. compare `git ls-remote --tags origin` vs `git ls-remote --tags "$remote"` per mirror (or simply `git push --tags` + CI check of `ls-remote` per mirror after each release).
3. Avoid `--force-with-lease … HEAD:main` rewriting history on public mirrors consumers clone; a fast-forward push keeps tag↔commit reachability stable.

**Version routing / docs (defect 2):**

1. Never make "newest tag" the README's default install pin. Pin the default install command to the version targeting the *oldest supported* DSH line, and publish per-DSH-version install commands in the README's compatibility table (e.g. a `#v0.9.3` command for 0.1.1-rc.x users, a `#v0.9.7` command for 0.1.2-alpha.x users).
2. Encode the DSH compatibility range in the plugin manifest (`engines`/peer-dependency or the community-standard `dsh-plugin.json` compatibility field) so the host can *refuse* an incompatible plugin at install/activation with a clear message instead of crashing in the browser slot with `TypeError: useConversation is not a function`.
3. Add a release checklist item: "README default install tag targets a DSH line actually supported by the current consumer base" — the v0.9.7 bump shipped a default that no pre-alpha consumer could run.

## Structure per skill

- **Completed**: full read-only diagnosis from fixture evidence; remedy and maintainer fixes above.
- **Skipped**: no runtime verification (task is read-only static diagnosis; fixture explicitly non-executable).
- **Pending/residual risk**: none blocking; assumes the compat-table mapping is authoritative.
- **Rollback**: not applicable — no writes outside this report; fixture untouched.
