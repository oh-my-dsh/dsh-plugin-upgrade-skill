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

# S8 · Release Routing Trap — Release-Engineering Diagnosis

**Consumer runtime:** `dsh 0.1.1-rc.2` (frozen — production freeze, cannot upgrade)
**Plugin:** `@org/dsh-ui-progress` (`github:public-org/dsh-ui-progress`, mirrored to two public mirrors)
**Verdict:** Two *distinct* defects, in sequence: (1) a **tag-distribution defect** on the maintainer side — the pinned ref `v0.9.5` was never published to the mirror the README tells users to install from; (2) a **version-routing defect** — the README's default command routes every consumer to *the newest tag*, and the newest tag (`v0.9.7`) is an artifact built for a **newer DSH runtime** (`0.1.2-alpha.1`) than this consumer can run. Neither defect is on the consumer's network or command syntax.

Evidence used (read-only fixture): `ls-remote-tags.txt`, `sync-script.sh`, `compat-table.md`, `dsh-version.txt`, `README.md`.

---

## 1. Attempt 1 — why `#v0.9.5` could not resolve

### Symptom
`dsh plugin --profile web add '@org/dsh-ui-progress@github:public-org/dsh-ui-progress#v0.9.5'` → pnpm fails immediately, at fetch/resolve time (before any code runs).

### Root cause: the pinned tag does not exist on the mirror
`git ls-remote --tags https://github.com/public-org/dsh-ui-progress.git` (`ls-remote-tags.txt`) shows the mirror's complete tag set:

```
v0.1.0 … v0.5.1, v0.6.0, v0.7.0, v0.8.0, v0.9.0, v0.9.1, v0.9.7
```

There is a contiguous gap **v0.9.1 → v0.9.7**: tags `v0.9.2`, `v0.9.3`, `v0.9.4`, **`v0.9.5`**, `v0.9.6` were never distributed to `public-org`. The README's default install command pins `#v0.9.5`, so every consumer running the documented command hits a ref that does not resolve on the mirror → immediate pnpm/git fetch failure. This is a determinism failure in the release pipeline, not a consumer-side problem.

### The release-engineering defect behind it
`sync-script.sh` — the only release automation, "runs after every release, for each mirror" — propagates **only the branch**:

```bash
for remote in origin public mirror2; do
  git push --force-with-lease "$remote" HEAD:main   # no tags pushed, anywhere
done
```

There is **no `--tags` / `--follow-tags` / per-release tag push**, and no post-push verification that the released tag actually appears on each mirror. Tag distribution to the two public mirrors is therefore ad-hoc and unverified: the presence of `v0.9.7` on the mirror (a tag this script cannot produce) alongside the missing `v0.9.2–v0.9.6` block is direct evidence that tags reached the mirrors only through out-of-band, manual pushes. The README pinned a tag that existed in the project's release history but was never propagated to the mirror consumers were told to use. (Whether `v0.9.5` was never cut or was cut-but-not-distributed is indistinguishable from mirror-side evidence — and it doesn't matter: the process defect — no automated, verified tag distribution and no gate validating documented refs against the mirrors — is the same.)

**Not the cause:** consumer network, consumer command syntax, mirror outage (the mirror is up and serving other tags).

---

## 2. Attempt 2 — why `v0.9.7` installed but crashes

### Symptom
Retrying with the bumped README pin `#v0.9.7` → install succeeds (the tag exists on the mirror), then the plugin's slot entry fails in the browser with `TypeError: useConversation is not a function`. Restart does not help.

### Compatibility direction (which artifact targets which DSH version)
From `compat-table.md` (the plugin's own published matrix):

| Plugin version | Targets DSH version | Notes |
|---|---|---|
| v0.9.3 | `@deepseek-ai/dsh@0.1.1-rc.1` | rc.1 real-boot verified; **rc.2 is rc.1 + image preprocessing (additive)** → v0.9.3 runs on the consumer's rc.2 |
| **v0.9.7** | **`dsh-v0.1.2-alpha.1`** | "Migrated to the alpha.1 client API (views/legacy projection + `useConversation` seat)" |

The consumer's runtime is `0.1.1-rc.2` (`dsh-version.txt`). `0.1.2-alpha.1` is a **newer runtime line** than `0.1.1-rc.2`. `v0.9.7` was migrated onto the alpha.1 client API and calls `useConversation`, a symbol that only exists in dsh `0.1.2-alpha.1`. On the consumer's `0.1.1-rc.2` runtime that export does not exist, so the slot entry's call throws `TypeError: useConversation is not a function` at load time. A restart cannot fix it: the failure is a deterministic API-absence mismatch baked into the artifact, not stale state or a corrupted install.

### The version-routing defect
"Newest tag" and "compatible with your runtime" are **not the same thing** here. The README's *default* install command pins the newest release (`#v0.9.7`), which unconditionally targets the `0.1.2-alpha.1` line — so every consumer frozen on the `0.1.1` line is routed, by default, onto an artifact their runtime cannot load. Bumping the README pin from `v0.9.5` to `v0.9.7` exchanged an *unresolvable ref* for an *incompatible artifact*: it cleared the fetch error and surfaced the routing error. (Note also that v0.9.7 is forward-only: it requires dsh ≥ 0.1.2-alpha.1, so it cannot be made to work on rc.2 without the consumer upgrading their runtime — which they cannot.)

---

## 3. Exact remedy for the consumer (works on their frozen runtime)

The only evidence-backed artifact for the consumer's `0.1.1-rc.2` line is **`v0.9.3`** (compat table: targets `0.1.1-rc.1`; rc.2 = rc.1 + additive image preprocessing). No other mirror tag has a documented rc-line mapping. But per §1, `v0.9.3` is **also missing from the mirror** — so the fix necessarily couples both defects:

**Step A — maintainer distributes the missing tag** (from the origin repo, once):

```bash
git push public  refs/tags/v0.9.3   # mirror "public" = github:public-org/dsh-ui-progress
git push mirror2 refs/tags/v0.9.3   # second mirror
# verify before telling the consumer to retry:
git ls-remote --tags https://github.com/public-org/dsh-ui-progress.git | grep -F refs/tags/v0.9.3
```

(Also push the rest of the orphaned block `v0.9.2`, `v0.9.4`–`v0.9.6` while there — same defect class. If any of them is known-bad, publish an explicit "do not install" note rather than leaving a silent gap.)

**Step B — consumer swaps the artifact, without touching their runtime:**

```bash
# 1. remove the incompatible v0.9.7 install from the web profile
dsh plugin --profile web remove '@org/dsh-ui-progress'
# 2. install the rc-line-compatible tag
dsh plugin --profile web add '@org/dsh-ui-progress@github:public-org/dsh-ui-progress#v0.9.3'
```

(The `remove` invocation should match whatever your installed CLI's remove semantics are; `dsh --version` stays `0.1.1-rc.2` — the consumer changes nothing on the runtime.) After the install, a fresh dsh start loads the slot entry; confirm no `useConversation` TypeError on the `web` profile.

**Fallback if the mirror tags cannot be pushed immediately:** the consumer can install the same tag from any source that has it — the origin repository, if public, e.g. `dsh plugin --profile web add '@org/dsh-ui-progress@github:<origin-org>/dsh-ui-progress#v0.9.3'` (substitute the origin org — the fixture does not name it). What does **not** work: staying on `#v0.9.7` with any restart, pinning any other existing mirror tag (only v0.9.7 and ≤v0.9.1 exist there, and only v0.9.3 has a documented rc-line mapping), or upgrading the runtime (frozen).

---

## 4. Maintainer-side fixes so both defects cannot recur

### Release tooling
1. **Distribute tags as part of the release.** After every release, push the annotated tag to every mirror in the same automated step as `main` — e.g. `git push "$remote" "refs/tags/v${VERSION}"` (or `--follow-tags`) inside the existing `for remote in origin public mirror2` loop in `sync-script.sh`. The current script's branch-only push is precisely why `v0.9.2–v0.9.6` never reached the mirrors.
2. **Verify distribution, fail the release if it fails.** After pushing, run `git ls-remote --tags "$remote"` per mirror and assert the new tag is present; treat "tag exists locally but not on mirrors" as an unreleased release. Never announce a version before every mirror advertises its tag.
3. **Make release one atomic, ordered step:** tag → push tags to all mirrors → push `main` → verify all mirrors → only then update docs. This removes the ad-hoc manual tag push that produced the current mirrored-only-`v0.9.7` situation.
4. **CI smoke test that runs the documented command.** In a clean container, for each mirror: run the exact README install command (`dsh plugin … '#vX.Y.Z'` from that mirror) **against the pinned DSH runtime for that release**, then boot dsh and load the plugin's slot entry. This single gate catches *both* defect classes — unresolvable refs (attempt 1) and runtime/API incompatibility (attempt 2) — before the README is published.

### Docs / version routing
5. **Stop defaulting the README to "newest tag".** Route by runtime, using the compat table that already exists:

   | Your dsh runtime | Install |
   |---|---|
   | `0.1.1-rc.x` | `dsh plugin --profile web add '@org/dsh-ui-progress@github:public-org/dsh-ui-progress#v0.9.3'` |
   | `0.1.2-alpha.1` or newer | `dsh plugin --profile web add '@org/dsh-ui-progress@github:public-org/dsh-ui-progress#v0.9.7'` |

6. **Keep the compatibility matrix a release gate.** `compat-table.md` must be updated (including pre-release lines like `rc`/`alpha`, and "additive vs breaking" notes) in the same PR as each release, and CI must fail if the matrix doesn't cover the released tag.
7. **Declare the required runtime in the artifact.** Put the supported DSH version in the plugin's package metadata (e.g. an `engines`-style field) so `dsh plugin add` can *reject or warn at install time* on a runtime mismatch, instead of surfacing as a `TypeError` in the browser at slot load.
8. **Consider stable per-runtime routing tags** (e.g. a `dsh-0.1.1` roll-up tag always pointing at the newest release compatible with the `0.1.1` line) so "newest for my runtime" is expressible without the consumer consulting the matrix at all.

---

## 5. Why the two failures are distinct (summary)

| | Attempt 1 (`#v0.9.5`) | Attempt 2 (`#v0.9.7`) |
|---|---|---|
| Defect class | Tag **distribution** | Version **routing** |
| Failure point | Ref resolution (pnpm fetch, before install) | Slot load (`TypeError` at runtime) |
| Cause | Mirror never received tag `v0.9.5`; sync script pushes only `main`, tags ad-hoc | Artifact targets dsh `0.1.2-alpha.1`; consumer is on `0.1.1-rc.2` (frozen) |
| Fix | Automate + verify tag distribution to mirrors | Route install commands by runtime; declare required runtime in artifact |

Fixing either one alone leaves the other open: even with perfect tag distribution, the newest tag is still incompatible with the consumer's line; even with a correct pin, the pin is worth nothing if the tag isn't mirrored.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.