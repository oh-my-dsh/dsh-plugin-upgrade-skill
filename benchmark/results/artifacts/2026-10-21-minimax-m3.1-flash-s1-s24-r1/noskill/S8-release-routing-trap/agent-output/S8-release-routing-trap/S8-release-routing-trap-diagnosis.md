# S8 · Release Routing Trap — Release-Engineering Diagnosis

**Subject:** `dsh-ui-progress` community plugin, two public GitHub mirrors
**Consumer runtime (frozen):** dsh `0.1.1-rc.2`
**Evidence:** static pack in `/app/fixture/` (read-only; verified byte-identical after analysis — see Appendix B)
**Constraint honored:** the consumer cannot upgrade their dsh runtime (production freeze). Every remedy below works on `0.1.1-rc.2`.

---

## 0. Executive summary

The two failures have **two different root causes**, both on the maintainer's side, and neither is a consumer error, a network problem, or a broken command.

| Attempt | Command | Symptom | Root cause | Class |
|---|---|---|---|---|
| 1 | `...#v0.9.5` | pnpm aborts immediately | **Tag distribution defect** — `v0.9.5` was never published to the mirror the consumer installs from; the release sync script propagates **branch heads only** (`git push --force-with-lease "$remote" HEAD:main`) and never tags | Distribution (artifact does not exist at the ref) |
| 2 | `...#v0.9.7` | installs fine, then `TypeError: useConversation is not a function` in the browser | **Version-routing defect** — `v0.9.7` targets dsh `v0.1.2-alpha.1` (alpha.1 client API: views/legacy projection + `useConversation` seat); the consumer runs `0.1.1-rc.2`, where that export does not exist | Compatibility / target-version routing (artifact exists but targets a different DSH release line) |

**The trap itself:** the README routed the consumer by *plugin tag* ("use the pinned tag", then "use the newest tag"). The correct routing key is the **DSH target version of the plugin artifact**, because the plugin's DSH floor rises with its own version. Under a runtime freeze, "newest tag" is exactly the wrong direction — the maintainer's own bump from `#v0.9.5` to `#v0.9.7` moved the consumer *up* a line they cannot reach.

**Remedy (consumer, today):** install **`#v0.9.3`** — the newest plugin version whose DSH target (`0.1.1-rc.1`) is satisfied by the consumer's `0.1.1-rc.2`. Because `v0.9.3` is *also* missing from the mirror's tag list (same distribution defect as `v0.9.5`), the tag must be published to the public mirror first; that is a maintainer-side action and does **not** touch the consumer's frozen runtime.

---

## 0.1 Evidence inventory (fixture card IDs)

| ID | Source (path) | Key points used |
|---|---|---|
| **E1** | `fixture/ls-remote-tags.txt` | `git ls-remote --tags` of `https://github.com/public-org/dsh-ui-progress.git` — the *same remote the consumer installs from*. Present: v0.1.0, v0.2.0, v0.3.0, v0.4.0, v0.5.0, v0.5.1, v0.6.0, v0.7.0, v0.8.0, v0.9.0, v0.9.1, **v0.9.7**. Absent: v0.9.2, **v0.9.3**, v0.9.4, **v0.9.5**, v0.9.6 |
| **E2** | `fixture/compat-table.md` | Plugin v0.9.3 → npm `@deepseek-ai/dsh@0.1.1-rc.1` ("rc.1 real-boot verified; rc.2 is rc.1 + image preprocessing (additive)"); plugin v0.9.7 → `dsh-v0.1.2-alpha.1` ("migrated to the alpha.1 client API (views/legacy projection + useConversation seat)") |
| **E3** | `fixture/dsh-version.txt` | Consumer's runtime: `dsh --version` → `0.1.1-rc.2` |
| **E4** | `fixture/sync-script.sh` | Post-release sync, per mirror (`origin`, `public`, `mirror2`): rewrites the install-source org for the target mirror, then `git push --force-with-lease "$remote" HEAD:main`. **No tag push.** |
| **E5** | `fixture/README.md` | Fixture provenance note: the attempt-2 crash string is quoted in the task brief, **not** shipped as a log file |
| **E6** | task brief (not fixture) | Consumer's two attempts, the crash text `TypeError: useConversation is not a function`, and the production freeze |

---

## 1. Attempt-1 root cause — tag distribution defect (`#v0.9.5` unresolvable)

### 1.1 Finding

**`refs/tags/v0.9.5` does not exist on the remote the consumer installs from.** E1 is the literal output of `git ls-remote --tags` against `github:public-org/dsh-ui-progress` — the exact host/org in the consumer's install string. The listing jumps `v0.9.1 → v0.9.7`. There is no `v0.9.5` (and no `v0.9.2`, `v0.9.3`, `v0.9.4`, `v0.9.6`) on the remote.

### 1.2 Mechanism (why pnpm "failed immediately")

`github:public-org/dsh-ui-progress#v0.9.5` is a Git-resolved dependency: pnpm must resolve the ref `v0.9.5` to a commit *before* anything is built, fetched, or installed. The sequence is:

1. pnpm hands the spec to git → `git ls-remote`/fetch for `refs/tags/v0.9.5`.
2. The remote has no such ref → git reports the ref as not found (no remote ref / unresolvable ref).
3. pnpm aborts at dependency resolution.

That is exactly the reported behaviour: **failure "immediately", with no download, no build, and no plugin code ever reaching the browser.** A failing *ref resolution* is categorically different from a failing *build* or a failing *runtime* — it points at the tag namespace, not at the artifact's contents.

### 1.3 The release-engineering defect (not "the consumer's fault")

The tag list is **non-contiguous**: v0.9.0, v0.9.1, v0.9.7 exist, but the four releases in between do not. A healthy release pipeline that publishes every release produces a contiguous list. Non-contiguity means **tag publication is a manual, per-release, unverified side effect** rather than an automated, verified step of the release.

E4 shows why. The release sync script that runs *after every release, for each mirror* propagates **only a branch head**:

```bash
git push --force-with-lease "$remote" HEAD:main
```

It moves `main` to the local `HEAD` and stops. It **never creates or pushes a tag ref**. Consequences:

- A release can be "done" — commits merged, `main` force-pushed to all three remotes — while its tag exists only in the local/origin repository. The mirror's tag namespace silently diverges from the source repo's.
- `v0.9.7` *is* present on the mirror, which is why attempt 2 installed: the maintainer evidently pushed that one tag by hand when they bumped the README, whereas `v0.9.5` (the README's own default at the time) and `v0.9.3` were never pushed. **The one tag that reached the mirror is the one somebody pushed manually; the tags the pipeline was supposed to carry did not.** This is the signature of an automation gap, not a one-off typo.
- `--force-with-lease ... HEAD:main` also rewrites history on the mirrors. Anything that ever *did* push a tag can be silently orphaned (the tag then points at an object the mirror no longer has, producing a different-but-equally-fatal fetch error). Tag refs must be treated as immutable and pushed explicitly; branch force-pushes must never be the mechanism that carries releases.

The **README default install command was itself invalid**: the documented `#v0.9.5` pin pointed at a ref that had never been distributed to any mirror. The README asserted a version the published artifact set did not contain. The README's install command was therefore never validated end-to-end against the mirror it tells consumers to use.

### 1.4 Ruled out

- **Not the consumer's network.** A network fault produces a timeout/TLS/DNS error or a clone failure, not a clean "ref not found" that is reproducible against a ref we can *prove* is absent from the remote's advertised refs. E1 lists the remote's refs; `v0.9.5` is not among them.
- **Not a malformed consumer command.** The command shape (`github:<org>/<repo>#<tag>`) is correct and the very same shape with `#v0.9.7` succeeded in attempt 2 — same host, same org, same profile, same quoting. Only the ref changed, and only the ref's presence differs.
- **Not a build/install failure of the v0.9.5 content.** pnpm never got far enough to build v0.9.5; it never fetched it.

---

## 2. Attempt-2 root cause — version-routing defect (`#v0.9.7` installed, then crashed)

### 2.1 The compatibility direction (which artifact targets which DSH version)

E2 is the plugin's own compatibility table. Read it as "plugin artifact → DSH version it was built for and requires":

| Plugin artifact | Targets DSH | Client-API line it was migrated to |
|---|---|---|
| **v0.9.3** | `@deepseek-ai/dsh@0.1.1-rc.1` | the 0.1.1-rc line (real-boot verified on rc.1) |
| **v0.9.7** | `dsh-v0.1.2-alpha.1` | the **alpha.1** client API — "views/legacy projection + **useConversation** seat" |

**The direction is one-way and upward.** A plugin artifact declares a *floor* on the DSH runtime: it targets a specific DSH client-API surface. The consumer's runtime (E3) is `0.1.1-rc.2`.

- `0.1.1-rc.2` is on the **0.1.1-rc** line. `0.1.2-alpha.1` is a prerelease of a **different minor line (0.1.2)** and carries the **alpha.1** client API. It is not a successor of `0.1.1-rc.2` that `0.1.1-rc.2` could contain; the alpha.1 surface is a *different* API generation.
- Therefore the consumer's runtime is **below the floor required by v0.9.7** (`0.1.1-rc.2` < `0.1.2-alpha.1`). The plugin is not "slightly too new" — it was migrated across a client-API generation boundary.
- Conversely, `v0.9.3` targets `0.1.1-rc.1`, and E2 states that **rc.2 is rc.1 + image preprocessing (additive)**. An additive change is backward-compatible for a plugin that does not consume the new preprocessing API, and v0.9.3 was verified real-boot on rc.1. So `0.1.1-rc.2` **satisfies** v0.9.3's target. v0.9.3 is the newest documented artifact the consumer's runtime can host.

### 2.2 Mechanism of the crash

v0.9.7 "migrated to the alpha.1 client API (views/legacy projection + `useConversation` seat)" (E2). The `useConversation` **seat hook is part of the alpha.1 client API surface**. The consumer's `0.1.1-rc.2` runtime does not export it: on that runtime the import resolves to `undefined`, and the plugin's slot entry invokes it as a hook during render →

```
TypeError: useConversation is not a function
```

This is the signature of a **missing named export**, not a React hook-rules violation: a hooks-rules error reads "Invalid hook call", and a present-but-misused hook reads differently. "…is not a function" is exactly what an `undefined` export produces at call time. The migration in v0.9.7 was **one-way** — the legacy projection path it dropped is not restored by installing on an older runtime, and the alpha.1 API it needs is not backported into the 0.1.1-rc line.

### 2.3 Why the install succeeded, and why restarting dsh did not help

- **Install succeeded** because the install pipeline only resolves/fetches/builds the package. It does not enforce the plugin's DSH client-API contract: the fixture shows no declared DSH peer-range on the plugin, so nothing warns at install time that v0.9.7 requires 0.1.2-alpha.1. The incompatibility is a *runtime surface* mismatch, so it can only surface when the slot component actually renders in the browser.
- **Restarting dsh did not help** because the mismatch is a *version contract* between an installed artifact and an installed runtime, not a stale process, cached bundle, or transient fault. No amount of restarting changes which DSH version is on disk. (A restart *would* have fixed a stale-client-bundle symptom; the fact that it did not is positive evidence that the cause is the version contract, not cache staleness.)
- **Waiting does not help either.** `0.1.1-rc.2` is the last build of the 0.1.1-rc line; `useConversation` arrives with the 0.1.2-alpha line, i.e. with a runtime upgrade — which is precisely what the production freeze forbids. There is no patch release of `0.1.1` that will add the alpha.1 seat hook.

### 2.4 The trap, stated precisely

The README routed by **plugin tag**; the runtime is gated by the **DSH target version**. The maintainer's bump from `#v0.9.5` to `#v0.9.7` looked like "just point at the newest release", but it silently raised the consumer's required DSH version from the 0.1.1-rc line to the 0.1.2-alpha line. For a consumer who *can* upgrade, that is a routine bump. For a frozen consumer, it is an unsatisfiable requirement. The routing signal (`latest`) is monotonically increasing in the plugin's own version, while the thing that must hold constant — the DSH target — had moved. **The routing key must be the DSH target, not the plugin tag.**

---

## 3. The exact remedy for the consumer, right now

### 3.1 Prerequisite (maintainer side, seconds, does not touch the consumer's runtime)

`v0.9.3` is **not currently on the public mirror** (E1) — installing `#v0.9.3` today fails exactly like `#v0.9.5` did. So the tag must be published first, from the maintainer's clone, to the `public` remote (the remote name used in E4, whose URL is `github:public-org/dsh-ui-progress`):

```bash
# from the maintainer's clone of dsh-ui-progress, with the v0.9.3 tag present locally
git push public refs/tags/v0.9.3

# and verify it actually landed (must print refs/tags/v0.9.3)
git ls-remote --tags https://github.com/public-org/dsh-ui-progress.git | grep 'refs/tags/v0.9.3'
```

If the local tag object itself was never created (the pipeline created no tag at all), recreate it immutably at the v0.9.3 release commit and then push it — see §4.3 for the SHA-lookup command; the specific SHA is **not** in the evidence pack (see §5).

### 3.2 The install command (consumer, on dsh 0.1.1-rc.2)

```bash
dsh plugin --profile web add '@org/dsh-ui-progress@github:public-org/dsh-ui-progress#v0.9.3'
```

This is the same command shape the consumer already used successfully in attempt 2, with the ref changed from `v0.9.7` to `v0.9.3`. It keeps their runtime at `0.1.1-rc.2` (no upgrade required, freeze respected) and it targets the one plugin artifact whose DSH target (`0.1.1-rc.1`) the consumer's `0.1.1-rc.2` satisfies (E2, additive rc.2 note). Because the plugin ships no code path that touches the alpha.1 client API, the `useConversation` symbol is never imported, so the crash cannot occur.

**If the consumer currently has v0.9.7 installed**, remove it first so the incompatible artifact is not the one that renders the slot:

```bash
dsh plugin --profile web remove '@org/dsh-ui-progress'
dsh plugin --profile web add '@org/dsh-ui-progress@github:public-org/dsh-ui-progress#v0.9.3'
```

### 3.3 What the consumer must NOT do

- **Do not retry `#v0.9.7`** — it will keep failing with the same `useConversation` error; the runtime, not the install, is the mismatch.
- **Do not upgrade dsh to 0.1.2-alpha.1** — that is the one option the production freeze forbids, and it is not needed.
- **Do not "fix" it by upgrading within the 0.1.1-rc line** — no 0.1.1-rc build carries the alpha.1 `useConversation` seat; rc.2 is the last of that line.
- **Do not rely on a restart or cache clear** — already disproven by the brief (E6); the cause is a version contract.

### 3.4 If the maintainer cannot publish `v0.9.3` immediately

Only two other routes exist, and both are inferior:

- **A second mirror.** The maintainer publishes to two public mirrors (E4 remotes: `public`, `mirror2`). E1 documents only the `public` remote's tag list. It is **unconfirmed** whether `mirror2` already carries `v0.9.3`. Check with `git ls-remote --tags <mirror2-url>`; if it is there, the consumer can install the identical ref from that mirror URL. Until that check is run, do not claim the tag exists there.
- **A commit-pinned install.** `github:public-org/dsh-ui-progress#<sha-of-v0.9.3>` would install the same code without needing a tag, but the SHA is not in the evidence pack (**unconfirmed**) and SHA pins are not a publishable release address. The tag push in §3.1 is the correct fix.

---

## 4. Maintainer-side fix so neither defect can recur

The two defects live in different layers, so the fix has two layers. Both must ship; fixing only one leaves the other reachable.

### 4.1 Release tooling — close the tag-distribution gap (fixes attempt 1)

1. **Publish the tag as part of the release, per mirror, explicitly.** The sync script (E4) must push the tag ref, not just the branch head:

   ```bash
   for remote in origin public mirror2; do
     git push --force-with-lease "$remote" HEAD:main
     git push "$remote" "refs/tags/$RELEASE_TAG"     # explicit, per release
   done
   ```

   Use an explicit `refs/tags/<tag>` push rather than `--follow-tags`: `--follow-tags` only pushes *annotated* tags reachable from the pushed commits, so a lightweight tag or a tag on a rewritten commit is silently skipped — exactly the failure mode observed.

2. **Verify per mirror and fail the release.** After the push loop, assert the released tag is advertised by every remote, and make a mismatch a hard release failure:

   ```bash
   for remote in origin public mirror2; do
     git ls-remote --tags "$remote" | grep -qx "refs/tags/$RELEASE_TAG"        || { echo "release aborted: $RELEASE_TAG missing on $remote" >&2; exit 1; }
   done
   ```

3. **Add a cross-mirror tag-set diff to CI.** Compare `git ls-remote --tags` across `origin`, `public`, `mirror2`; any divergence between mirrors (not just "missing on all") fails the build. The current failure mode was an *absence on all public mirrors*, which a "does origin have it?" check would not have caught.

4. **Never force-push a tag.** Keep `--force-with-lease` for branches only. Add a CI/pre-push guard that rejects any push whose refspec touches `refs/tags/` with a force flag, so a rewritten `main` can never orphan a published tag. Releases are addressed by immutable tag; `main` is not a release artifact.

5. **Smoke-test the documented command.** In CI, run the README's exact install line into a throwaway profile against the new tag (`dsh plugin --profile web add '...#<newtag>'`). A README whose default command points at an undistributed tag (as `#v0.9.5` did) becomes a build failure instead of a consumer report.

### 4.2 Make the DSH requirement machine-readable and fail fast (fixes attempt 2's late detection)

6. **Declare the DSH target in the package metadata**, e.g. a `dsh` field or `peerDependencies` entry in `package.json`:

   - v0.9.3 → `"dsh": ">=0.1.1-rc.1 <0.1.2"` (covers rc.1 and the additive rc.2)
   - v0.9.7 → `"dsh": ">=0.1.2-alpha.1"`

   Then `dsh plugin add` can reject the install with a precise message — "plugin v0.9.7 requires dsh ≥0.1.2-alpha.1; your runtime is 0.1.1-rc.2" — instead of deferring the failure to a browser `TypeError` in a slot entry. The install step already resolves the runtime version; it simply was not comparing it to anything.

7. **Publish one entry per DSH release line, not one "latest" entry.** Ship parallel, permanently-supported release lines so that "newest" and "compatible" stop being the same word. The current release process allows the newest tag to require a runtime generation the 0.1.1-rc line will never have, which makes any frozen consumer permanently unsatisfiable.

### 4.3 Documentation fixes (fixes the routing trap itself)

8. **The README's install section must be a compatibility matrix, not a single pin.** Replace "default install command" with one pinned line per DSH line, each annotated with the runtime it requires — e.g. "DSH 0.1.1-rc.x → `#v0.9.3`" and "DSH 0.1.2-alpha.1 → `#v0.9.7`" — plus a rule: *pin the newest tag whose DSH requirement your runtime satisfies, not the newest tag overall.* The first rule that lands there is a README that ships a version the mirror does not have (§1.3), the second is the rule that caused attempt 2 (§2.4).

9. **Generate the compat table from a single source of truth.** Keep `dsh-version → plugin version` mapping in one machine-readable file (e.g. `releases.json`), and have the release job emit both the README table and the package metadata from it. The incident is precisely a **docs/artifact drift**: the README's pin, the mirror's tag set, and the artifact's real DSH target were three independent facts that nobody reconciled at release time.

10. **Announce DSH-floor changes explicitly.** When a release raises the required DSH version, the release notes and README must state it in a way a frozen consumer cannot miss (e.g. "⚠️ v0.9.7+ requires dsh 0.1.2-alpha.1"). A silent floor bump is indistinguishable, from the consumer's side, from a broken release.

11. **Record the intended DSH target in the tag itself**, e.g. annotated tag messages of the form `plugin v0.9.3 | requires dsh >=0.1.1-rc.1`, so the requirement travels with the ref that the README points at.

### 4.4 Minimal change set if only one thing can ship

Push the missing tags (`v0.9.3` at minimum) to **all** mirrors and add the per-remote verification loop (§4.1 steps 1–2) — that removes the attempt-1 failure mode permanently. Add the README compatibility matrix (§4.3 step 8) — that removes the attempt-2 routing trap. The remaining items harden detection and prevent silent drift.

---

## 5. Unconfirmed / not evidenced in the fixture

Recorded as open questions rather than guesses:

- **The `v0.9.3` commit SHA** is not in the evidence pack; needed only if the local tag object must be recreated (§3.1). Lookup, if required: `git log --oneline --decorate --all` / `git rev-list -n1 v0.9.3` in the maintainer's clone.
- **Whether `mirror2` already carries `v0.9.3`.** E1 covers the `public` remote only. Verify with `git ls-remote --tags <mirror2-url>`.
- **The exact v0.9.5 origin history.** Whether v0.9.5 existed locally in the source repo and was simply never pushed, or was never tagged at all, is not recoverable from E1/E4 (E4 is an *excerpt* of the sync script, so the absence of a tag push elsewhere in the full script is inferred, not proven; the *proved* fact is that the remote advertises no `v0.9.5`). The remedy is the same either way.
- **The attempt-2 crash has no log artifact** (E5): the `useConversation` string comes from the task brief. The chain "alpha.1 client API introduced the `useConversation` seat" is from E2, and the mechanism (missing named export → `TypeError` at call time) is standard JS semantics.
- **Whether the plugin declares any DSH range today.** No package manifest is in the fixture; the recommendation in §4.2 step 6 is therefore a proposal, not a description of current state.

---

## Appendix A — Timeline

```
release v0.9.5 prepared   ->  main force-pushed to mirrors   ->  tag v0.9.5 NEVER pushed   (E1, E4)
                             => README default pin #v0.9.5 is unresolvable
attempt 1 (consumer)      ->  pnpm: ref v0.9.5 not found       ->  FAIL (immediate)        [§1]
release v0.9.7 prepared   ->  main force-pushed               ->  tag v0.9.7 pushed BY HAND (E1)
                             => plugin v0.9.7 requires dsh v0.1.2-alpha.1  (E2)
attempt 2 (consumer)      ->  install OK on dsh 0.1.1-rc.2 (E3)
                             => runtime exports no useConversation (alpha.1 seat, E2)
                             => TypeError in the browser slot entry; restart has no effect    [§2]
REMEDY                    ->  publish tag v0.9.3 to public mirror
                          ->  dsh plugin --profile web add '@org/dsh-ui-progress@github:public-org/dsh-ui-progress#v0.9.3'
                             (v0.9.3 -> dsh 0.1.1-rc.1, satisfied by rc.2)                    [§3]
```

## Appendix B — Read-only compliance

The fixture was opened read-only and left byte-identical. SHA-256 of all five fixture files re-computed after analysis and compared against `fixture-seal.pre.json` (and `fixture-seal.source.json`): **5/5 match — fixture unchanged.** No fixture file was created, modified, moved, or deleted. No migration, installation, publish, push, or external service call was performed. This report is the only artifact written, under `/app/agent-output/S8-release-routing-trap/`.
