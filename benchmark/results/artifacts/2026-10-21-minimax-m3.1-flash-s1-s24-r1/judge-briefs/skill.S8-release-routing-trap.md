# JUDGE BRIEF · skill.S8-release-routing-trap

## Criteria (sealed rubric)
- [missing-mirror-tag] (20pt) Use ls-remote-tags.txt and sync-script.sh to explain that the README-pinned v0.9.5 is absent from the public mirror because the script pushes HEAD:main but not tags. Tie this to attempt 1 resolution failure, rather than guessing a network fault, consumer typo or missing npm package. Mere tag/version mentions earn no credit.
- [runtime-compatibility-direction] (20pt) Use dsh-version.txt (0.1.1-rc.2) and compat-table.md (v0.9.7 targets 0.1.2-alpha.1) to explain attempt 2: a newer-client-API artifact on an older runtime lacks the expected useConversation seat. Successful installation/restarting does not establish API compatibility. Explain the direction rather than only repeating the error.
- [frozen-runtime-remedy] (20pt) Honor the production freeze: select v0.9.3 using its rc.1 verification and the supplied additive rc.2 compatibility note. Notice v0.9.3 is ALSO absent from the mirror listing. Provide the consumer install command pinning #v0.9.3 after maintainer tag publication, or a reachable verified v0.9.3 commit as a conditional alternative. Do not invent a SHA, assume an unreachable commit resolves, require upgrading DSH, or present the absent tag as immediately installable.
- [tag-distribution-repair] (20pt) Propose explicit release-tag distribution to every public mirror, grounded in the branch-only sync script, and verify the documented tags resolve. Non-forced git push <remote> <tag> or --tags are equivalent. Branch synchronization alone is insufficient; a bare --tags keyword does not establish the repair.
- [version-routing-docs] (20pt) Prevent the second defect by routing README install commands according to the consumer DSH version: rc.2 users get the verified v0.9.3 artifact, alpha.1 users can use v0.9.7. Include a runtime version check or explicit compatibility matrix/branches. A single newest-tag default or restarting advice does not satisfy this requirement. Do not generalize support to every untested future alpha release.

## Caps (score ceilings; judge returns each with triggered true/false)
(none)

## Candidate report(s)
#### FILE: S8-release-routing-trap/S8-release-routing-trap-report.md

# S8 · Release Routing Trap — Release-Engineering Diagnosis

**Mode:** A · inspect (read-only). No plugin source, profile, lockfile, or fixture was modified; no install, migration, publish, or push was performed.
**Consumer constraint (from the brief):** the dsh runtime cannot be upgraded (production freeze), so every remedy must work on the consumer's **current** runtime.
**Evidence base:** the shipped fixture pack (static) + the bundled `skills/plugin-upgrade/` reference material. All findings below are traceable to those two sources; anything else is marked **Unconfirmed**.

---

## 0. Executive summary — two different defects, not one

The two failures share a symptom family ("the plugin does not work") but have **distinct root causes on opposite sides of the release line**:

| | Attempt 1 (`#v0.9.5`) | Attempt 2 (`#v0.9.7`) |
|---|---|---|
| **Failure layer** | **Tag distribution** (release plumbing) | **Version routing** (compatibility metadata) |
| **What broke** | The pinned ref **does not exist on the public mirror**, so the git spec cannot be resolved at all. | The ref resolves and installs, but the artifact **targets a newer DSH cohort** than the consumer's runtime. |
| **Direction of error** | Missing artifact (nothing to install) | Present but wrong-version artifact (installed, then crashes) |
| **Consumer's runtime** | n/a (install never started) | `0.1.1-rc.2` (from the fixture's dsh-version capture) |
| **Artifact's target** | n/a | `dsh-v0.1.2-alpha.1` (from the plugin compatibility table) |
| **Correct fix** | Fix tag propagation + README-ref validation (maintainer); pin a mirror-resident tag (consumer) | Route the consumer back onto the rc.1/rc.2 build line (consumer); publish the alpha line under a prerelease plugin version + declare peer ranges (maintainer) |

**The one-line diagnosis:** the release process never made "the ref in the README" and "the newest compatible ref" the same object on the mirror. Attempt 1 is a **missing tag**; attempt 2 is a **tag that exists but is routed to the wrong host cohort** — and because DSH peer-range enforcement only exists from **0.1.7-rc.1** onward (card `DSH-0.1.7-RC1-01`), a consumer on `0.1.1-rc.2` gets no install-time rejection, only a browser-time `TypeError`.

---

## 1. Evidence index (what the pack actually proves)

| Source | Fact used |
|---|---|
| `ls-remote-tags.txt` | `git ls-remote --tags https://github.com/public-org/dsh-ui-progress.git` (annotated tags dereferenced) returns **12 tags**: `v0.1.0, v0.2.0, v0.3.0, v0.4.0, v0.5.0, v0.5.1, v0.6.0, v0.7.0, v0.8.0, v0.9.0, v0.9.1, v0.9.7`. **`v0.9.5` is absent**, and so are `v0.9.2, v0.9.3, v0.9.4, v0.9.6`. The newest tag is `v0.9.7`; the newest tag below it is `v0.9.1`. |
| `dsh-version.txt` | Consumer runtime = `0.1.1-rc.2`. |
| `compat-table.md` | `v0.9.3` → `@deepseek-ai/dsh@0.1.1-rc.1` ("rc.1 real-boot verified; rc.2 is rc.1 + image preprocessing (additive)"). `v0.9.7` → `dsh-v0.1.2-alpha.1` ("Migrated to the alpha.1 client API (views/legacy projection + useConversation seat)"). |
| `sync-script.sh` | Post-release sync, per mirror (`origin`, `public`, `mirror2`): rewrites install-source orgs, then `git push --force-with-lease "$remote" HEAD:main` — **a branch push only; no tag-push line appears in the excerpt** — and the comment "rewrite install-source orgs for the target mirror" confirms the mirrors carry **different org names**. |
| `README.md` (fixture) | The pack is static evidence only; the attempt-2 `TypeError` is quoted in the task brief, not shipped as a log. |
| Task brief | Attempt 1 = pnpm failed immediately on `#v0.9.5`; attempt 2 = `#v0.9.7` installed, then `TypeError: useConversation is not a function` in the browser; restarting dsh did not help. |

**Reference cards used** (key points only, per the reporting rule): `DSH-0.1.2-A1-03`, `DSH-0.1.2-A1-25`, `DSH-0.1.2-A1-26`, `DSH-0.1.1-R1-01`, `DSH-0.1.1-R1-03`, `DSH-0.1.7-RC1-01`, `DSH-0.1.7-RC1-05`, `DSH-0.1.7-A2-04`, rollup `R-04` and `R-08`, plus `references/migration-hygiene.md` §3–§4 and the corridor index in `references/README.md`.

---

## 2. Attempt-1 root cause — a **tag-distribution** defect, not a network or command problem

### Finding
**The ref `#v0.9.5` does not exist on the mirror the install command points at.** The install spec `github:public-org/dsh-ui-progress#v0.9.5` resolves *by looking up that ref in that repository*; the mirror's authoritative tag inventory (`ls-remote-tags.txt`) contains no `v0.9.5`. A git spec whose ref is missing cannot be cloned, so the failure is deterministic and immediate — exactly "pnpm failed immediately".

### Why this is a release-engineering defect, not the consumer's network or command
* The command form is the documented one for this plugin class: `dsh plugin --profile <p> add <pkg|git|dir>` (`DSH-0.1.1-R1-01`), and the spec targets the **public mirror** (`public-org`), which the pack proves is reachable — `git ls-remote --tags` against it returned a complete, dereferenced tag list.
* A transport/network fault produces a *host* error, not a ref error. From `DSH-0.1.7-RC1-05`: the GitHub reachability precheck (a `git ls-remote` bounded by `githubConnectionTimeoutMs`) classifies only network failures/timeouts as `failedAt: 'spec-host'`, while **lookup failures are deliberately left to pnpm**. The consumer's symptom (immediate pnpm failure) is a *lookup* failure.
* The same evidence rules out "wrong flag / wrong profile / typo": the spec parses and reaches ref resolution, and the very next attempt with a *different* ref (`#v0.9.7`) on the *same* host, *same* profile, *same* network **succeeded**. Only the ref changed; only the ref was broken.

### The defect, stated as a process failure
The release pipeline's mirror-sync step pushes the **branch tip only** (`git push --force-with-lease "$remote" HEAD:main`). Nothing in the evidenced sync path guarantees that **release tags** reach the public mirror, so the mirror's tag set is a **partial, non-reproducible subset** of the release history:

* the mirror carries `v0.9.7` (so tags *can* arrive) but is missing the whole window `v0.9.2 … v0.9.6`, **including the README's own default pin `#v0.9.5` and the compat table's `v0.9.3`**;
* the README publishes a ref that **was never validated against the mirror** it points at.

Two aggravating details:
1. **The install source is mirror-specific.** The sync script rewrites the install-source org per mirror, so a README that hardcodes one mirror's org is valid only for that mirror — the defect is silently mirror-specific.
2. **It is intermittent by construction.** Because only some tags are pushed, the same README pin can work for some consumers and fail for others, with no signal at release time. That is the worst property for a "default install command".

> **Distinguish from a similar-looking cause:** rollup `R-08`'s "mirror lag" is **npm registry** mirror lag (E404/ETARGET on a registry package) and its remedy is to pin the official registry. It **does not apply here** — a `github:` git spec is resolved against git refs, not a registry. Do not "fix" this by switching registries.

**Unconfirmed:** whether `v0.9.5` was ever created in the `origin` repository, or only in the release author's local repo. The pack shows the mirror's inventory only. Either way the defect stands — the **documented** install command must resolve **on the mirror it names**; "it exists somewhere in our release repo" is not a usable guarantee. (The pack calls `sync-script.sh` an *excerpt*, so a tag-push line may exist outside the excerpt; but then the release would still need a gate that proves the README's ref resolves on **each** public mirror, and the missing `v0.9.2…v0.9.6` window shows no such gate existed or was not run for those releases.)

---

## 3. Attempt-2 root cause — a **version-routing** defect: the artifact targets a *newer* DSH than the consumer runs

### The compatibility direction (the key point)
The plugin compatibility table states it explicitly:

* `v0.9.7` → **DSH `dsh-v0.1.2-alpha.1`** — "Migrated to the alpha.1 client API (views/legacy projection + useConversation seat)".
* `0.1.1-rc.2` (**the consumer's runtime**) sits on the **earlier** side of the rc.2 → alpha.1 corridor.

So the installed artifact was **built against a newer host API than the host that loads it**. The arrow points the wrong way: a plugin targeting alpha.1 is being run on rc.2. The README's rule "install the newest tag" is what routed the consumer there — the plugin's release numbering does not encode the host cohort, and `v0.9.7` is a plain stable-looking version, so "newest" and "compatible with my host" were silently equated.

### Why the specific symptom is `useConversation is not a function`
* The compat table names the `useConversation` seat as part of the **alpha.1 client API** that `v0.9.7` migrated onto. The alpha.1 edge is exactly the edge that **removed `deepseek-ai/dsh-client-runtime`** and split client symbols out by domain (`DSH-0.1.2-A1-25`); the conversation symbols (`ConversationNode`, `IConversation`) moved to `deepseek-ai/dsh-client-ui-conversation/client`, and that package is one of the packages **added** on the rc.2 → alpha.1 edge.
* `DSH-0.1.2-A1-25` also records the *symptom family* of this class: after the client-runtime dismantling, a client half that references a package/surface the host does not provide **stays outside the boot graph or fails at activation**; and the alpha.1 edge reworked the session-view internals into the **views / legacy projection** shape (`DSH-0.1.2-A1-03`) — the same shape the compat table attributes to `v0.9.7`.
* On `0.1.1-rc.2` the client surface the host injects into the plugin's bundle **does not carry the `useConversation` seat**; the plugin's client half calls it as a function, gets `undefined`, and the slot entry throws `TypeError: useConversation is not a function` in the browser.

**Direction restated:** the artifact (`v0.9.7`) targets a **newer** DSH (alpha.1); the consumer runs an **older** DSH (rc.2). This is the classic *plugin-newer-than-host* incompatibility — the mirror image of the usual "host newer than plugin" case, and the reason the skill's own discipline treats plugin release version and DSH host corridor as **separate coordinates** that must never be inferred from one another.

### Why the install succeeded and why "restart dsh" could not help
* **The install succeeded** because `v0.9.7` *is* present on the mirror, and because peer-range enforcement does not exist on the consumer's host: `DSH-0.1.7-RC1-01` records that from **0.1.7-rc.1** the host compares the plugin's `deepseek-ai/dsh` peer range against the running version at install and at startup, refusing the plugin with a clear message. The consumer is on **0.1.1-rc.2** — long before that enforcement existed — so **nothing at install time could have caught the mismatch**. A missing peer declaration is equally unenforced there.
* **Restarting dsh cannot help** because the mismatch is *not* a stale process: the plugin's **client bundle is a build artifact** compiled against the alpha.1 API. Re-booting the same rc.2 host re-injects the same rc.2 client surface into the same alpha.1-targeted bundle. Restarting can only fix a *stale process*, never a *wrong-target artifact*. (The refresh-side rule is the mirror image: a change in `lib/client.js` takes effect on a **browser hard refresh**, a change in `lib/index.js` needs a **host restart** — `migration-hygiene.md` §3.)

### Why the crash is a **routing** defect and not a packaging defect
`v0.9.7` is a perfectly good build *for alpha.1*. It was never claimed to be broken. The release-engineering failure is that **the project published a host-cohort-targeted plugin version under an ordinary version number, made it the "newest tag", and offered it as the default install** to a population that includes rc.1/rc.2 hosts. Nothing in the release flow encoded or checked the target cohort.

---

## 4. The remedy for the consumer, right now (production freeze: dsh stays at `0.1.1-rc.2`)

### Decision rule
The target ref must satisfy **both**:
1. **It exists on the public mirror** (rules out `v0.9.5`, `v0.9.3`, `v0.9.2`, `v0.9.4`, `v0.9.6`), and
2. **It belongs to the rc.1/rc.2 build line** (rules out `v0.9.7`, which targets alpha.1).

### R1 — works today, no maintainer action required (primary recommendation)

```sh
dsh plugin --profile web add '@org/dsh-ui-progress@github:public-org/dsh-ui-progress#v0.9.1'
```

**Why `v0.9.1`:** it is the **newest tag present on the mirror that predates the alpha.1 client-API migration**. The compat table attributes that migration to `v0.9.7`, and it places `v0.9.3` on the rc.1/rc.2 line; `v0.9.1` precedes `v0.9.3`, so it belongs to the same pre-alpha (rc.1/rc.2) line, while still being one of the few tags the mirror actually carries.
**Evidence strength:** *inferred, not documented.* The pack has no compat row for `v0.9.1`; the inference is from version ordering plus the table's `v0.9.3 → rc.1` row. Confirm against the plugin's own release notes / the `v0.9.1` package's declared `peerDependencies` before treating it as final. If `v0.9.1` turns out to be unusable, fall through to R2.

### R2 — fully documented, needs one maintainer action (recommended if the maintainer can publish)

The compat table's newest **documented, real-boot-verified** build for the consumer's line is `v0.9.3`:

> `v0.9.3` → `@deepseek-ai/dsh@0.1.1-rc.1` — "rc.1 real-boot verified; rc.2 is rc.1 + image preprocessing (additive)"

`rc.2` is `rc.1` **plus an additive** image-preprocessing change, so a build verified on rc.1 is valid on rc.2. **But `v0.9.3` is one of the tags missing from the mirror** — the *same* distribution defect as `v0.9.5`. So the maintainer must first publish the missing tags, then the consumer installs:

```sh
dsh plugin --profile web add '@org/dsh-ui-progress@github:public-org/dsh-ui-progress#v0.9.3'
```

### R3 — fallback if neither R1 nor R2 is acceptable
Pin an **immutable commit SHA** of an rc.2-line build instead of a tag. The branch tip is the one ref the sync script guarantees is mirrored (`HEAD:main`), so a SHA that exists on the mirror's `main` is resolvable even when tags are not. **Unconfirmed:** the SHA is not in the pack; the maintainer must supply a SHA from an rc.2-line commit, and the SHA must be verified with `git ls-remote` on the mirror before the consumer uses it.

### Explicitly ruled out
| Spec | Why not |
|---|---|
| `#v0.9.5` | Not present on the mirror — this is attempt 1. |
| `#v0.9.7` | Installs, then crashes: targets `dsh-v0.1.2-alpha.1`, the consumer runs `0.1.1-rc.2`. |
| "newest tag" (any mirror) | Newest tag == newest cohort-targeted build. This rule is what caused attempt 2. |
| Upgrading the dsh host | Violates the production freeze; and per the skill's host-upgrade discipline, a global host upgrade must in any case be performed from an **external** terminal, never from inside a running session. |
| `allow-version` / peer exemption | `DSH-0.1.7-RC1-01`'s exemption mechanism does not exist on a 0.1.1-rc.2 host, and it would only silence a check the consumer's host does not perform — it would not make the alpha.1-targeted bundle run on rc.2. |

### Operational steps after the chosen install
1. Install the target ref with the command above (same alias, so the profile row is replaced rather than duplicated).
2. **Restart the dsh host** — a bundle-style plugin takes effect after a web restart (`DSH-0.1.1-R1-01`); the host-half swap needs a restart (`migration-hygiene.md` §3).
3. **Hard-refresh the browser** — the client half is re-pulled on refresh on this host line, and the crashed `v0.9.7` client bundle must be evicted from the browser cache. (The "client bundles are cached at host boot" behaviour, `DSH-0.1.7-A2-04`, landed in 0.1.7-alpha.2 and does **not** apply to 0.1.1-rc.2.)
4. Confirm the client half actually registers: the plugin's client entry must appear in the boot manifest and its slot must render. A Web Client half is only scanned into the browser roster when the package **declares `dsh.client`** (`DSH-0.1.1-R1-03`), and the registration id, the assembly row name and `package.json` `name` must agree (`DSH-0.1.2-A1-26`). If the slot is still missing after the restart + hard refresh, check these three ids before anything else — a silently-absent client half looks like "the plugin does not work" again.
5. If the plugin is installed as a plain Cordis plugin (a `cordis.patch.yml` insert row rather than a bundle row), confirm the insert row still names the bare package name (`DSH-0.1.2-A1-26`).

---

## 5. Maintainer-side fix — make both defects unrepeatable

### 5.1 Release tooling — tag distribution (fixes attempt 1)
1. **Push tags to every mirror in the sync step.** Replace the branch-only push with a tag-inclusive push per remote, e.g. `git push --force-with-lease "$remote" HEAD:main` **plus** `git push --tags "$remote"` (or `--follow-tags`), executed for **all** mirrors in the same loop, with the install-source org rewrite applied to the README/metadata for each mirror. Keep tags and branch push in **one** transaction so a release can never be "branch-mirrored, tag-missing".
2. **Post-release verification gate (hard failure).** After every release, for **each public mirror**, run `git ls-remote --tags <mirror>` and assert the newly released tag is present on **every** mirror; fail the release job otherwise. A release is not "done" until its tag is resolvable where the README says it is.
3. **README-ref lint.** Extract every `#<ref>` from the documented install commands and assert each resolves on every public mirror. This is the gate that would have caught `#v0.9.5` before publication — and it also covers the mirror-specific org rewrite, since the ref must resolve on the mirror whose org the README names.
4. **Version-count reconciliation.** Compare the set of released versions in the source repo (tags on `origin`) with the set on each mirror; report the delta. A non-empty delta is the exact signature of the current defect and must be a release-blocking error, not a warning.
5. **Idempotent re-push / repair path.** Publish a small "tag backfill" step that pushes any missing historical tags to the mirrors (this alone repairs `v0.9.2 … v0.9.6`, including `v0.9.3` and `v0.9.5`) — the consumer's R2 remedy depends on it.

### 5.2 Release tooling — version routing (fixes attempt 2)
6. **Encode the target cohort in the package manifest.** Each plugin release declares `peerDependencies` for `deepseek-ai/dsh` matching the DSH cohort it was built against. Rationale and the enforcement mechanism are `DSH-0.1.7-RC1-01`: from 0.1.7-rc.1 the host refuses a mismatching plugin **at install** (`installation rejected: … incompatible with dsh <ver>`) and disables a mismatching row **at startup** — so the routing error becomes a legible install-time refusal instead of a browser `TypeError`.
   * Bound the two lines so prerelease semantics cannot blur them (the host uses `semver.satisfies(runtime, range, { includePrerelease: true })` with semver ≥ 7.8.3 — the caret/prerelease matrix in `DSH-0.1.7-RC1-01` shows why):
     * **stable / rc.2 line** (e.g. the `v0.9.3` build): a range whose **upper bound sits below the first 0.1.2 prerelease** (e.g. `>=0.1.1-rc.1 <0.1.2-alpha.1`) — note that a plain `<0.1.2` still *admits* `0.1.2-alpha.1`, because a prerelease sorts below its own release;
     * **alpha line** (e.g. the `v0.9.7` build): a floor that names the prerelease cohort, e.g. `^0.1.2-alpha.1`, so it cannot be satisfied by `0.1.1-rc.2`.
   * A peer declaration is only meaningful if it is **enforced**: pair it with a CI lane that installs the plugin into a profile on the **target** host version and asserts the install is accepted, and a negative lane that asserts the *other* line is refused.
7. **Publish the alpha-cohort build under a prerelease plugin version and a prerelease dist-tag** (e.g. `v0.10.0-alpha.0`), keeping stable-looking versions on the stable-host line. Rollup `R-04` records the same rule from the npm side: plugin versions that adapt an alpha cohort go out under a prerelease number on the `alpha` dist-tag, `latest` staying on the stable-host line — "otherwise stable-host users get auto-upgraded to a new version with incompatible peers". That is precisely the `v0.9.7` defect, in a different channel.
8. **Do not let "newest tag" be a default install target.** The README's default command must name a tag whose cohort is stated, not the maximum tag number.
9. **Pre-release smoke test on the target cohort.** For every release, boot a real host of the **target** DSH cohort, install the built artifact, and assert: the client half registers (boot manifest + advertised bundle URL), the plugin's slot renders, and — for a client plugin — one conversation round completes. For the alpha line, add the **negative** assertion that the build is *not* published to the stable line.
10. **Build-order discipline.** The client bundle inlines a build-time version constant; bump → build → verify the artifact carries the new version, then commit/tag. Shipping a bundle built before the bump is what produces phantom "new version available" badges, and the same ordering keeps the compatibility table in the published package truthful.

### 5.3 Documentation fixes (README)
11. **Replace the single default install command with a per-host-version table**, e.g.

    | Your dsh runtime | Install ref | Target DSH |
    |---|---|---|
    | `0.1.1-rc.1` / `0.1.1-rc.2` | `#v0.9.3` (rc.2-verified; additive delta) | `0.1.1-rc.1` + additive |
    | `0.1.2-alpha.1`+ | `#v0.10.0-alpha.0` (the alpha-line tag on the mirror) | `0.1.2-alpha.1` |

    Each row must be machine-checked by the 5.1 lint (ref resolvable on the named mirror) and human-checkable against the compatibility table.
12. **State the target DSH cohort next to every install command**, and say plainly: *the newest tag is not automatically the right tag for your host version; check the table.*
13. **Document the mirror-specific install source** (each mirror has its own org after the rewrite) and the exact ref each mirror carries — the current README names one org and one ref, which is valid for at most one mirror.
14. **Document the operational steps** the consumer just had to discover: restart the host, then hard-refresh the browser; a client half only registers if the package declares `dsh.client` (`DSH-0.1.1-R1-03`); and the three ids (registration id / assembly row name / package name) must agree (`DSH-0.1.2-A1-26`).
15. **Document the pnpm build-script step** — pnpm ≥ 10 blocks dependency build scripts by default, so the profile may need `pnpm approve-builds --all` (`migration-hygiene.md` §4). A README that omits this manufactures a *third*, spurious "pnpm failed" failure mode.
16. **Publish the compatibility table as machine-readable data** (e.g. a `compatibility.json` in the repo and in the published package) so the README table, the peer ranges, and the release gate are generated from one source instead of hand-maintained in three places — the hand-maintained table is what let `v0.9.5` and `v0.9.3` be documented while missing from the mirror.

### 5.4 Recommended CI gates (summary)
| Gate | Blocks | Defect class |
|---|---|---|
| README-ref resolution lint (`git ls-remote` per public mirror) | release | tag distribution |
| Tag-set reconciliation (origin vs each mirror) | release | tag distribution |
| Peer-range lint + per-cohort install matrix | release | version routing |
| Alpha-line prerelease-version + dist-tag check | release | version routing |
| Target-cohort cold boot + client-registration + one round | release | version routing |
| Compatibility table ↔ manifest ↔ peer range consistency | release | both |

---

## 6. Validation performed (read-only) and what was deliberately not done

**Performed**
* Read the entire fixture pack once (5 files) and recorded the facts in §1.
* Verified the fixture is **byte-identical** to its seal (SHA-256 of all 5 files vs the pre-run and source seal manifests) — **all 5 unchanged**; nothing under the fixture was modified, moved, or deleted.
* Ran the skill's **read-only** migration planner (`skills/plugin-upgrade/scripts/plan-migration.mjs`) against the evidence pack on the `rc.2 → alpha.1` corridor: **exit 0, `readOnly: true`**, corridor `v0.1.2-alpha.1.md` recognised as curated, **7/7 touchpoints detected = false, 0 applicable cards**. This is the expected negative result and is itself informative: the pack is **metadata-only** (no plugin source), which confirms the diagnosis is driven by **release metadata** (tag inventory, cohort table, sync script), not by a source-level defect. The planner's output is heuristic and does not cover release-plumbing questions; the routing conclusions come from the compat table plus the cards cited above.
* Consulted the bundled cards/references for: the client-runtime dismantling and symbol-by-domain move (`DSH-0.1.2-A1-25`), the session-view split (`DSH-0.1.2-A1-03`), the three-ids registration contract (`DSH-0.1.2-A1-26`), `dsh.client` scanning (`DSH-0.1.1-R1-03`), the external-plugin install path and bundle restart semantics (`DSH-0.1.1-R1-01`), peer-range enforcement and its semver/prerelease matrix (`DSH-0.1.7-RC1-01`), the GitHub spec precheck and its ref-lookup hand-off to pnpm (`DSH-0.1.7-RC1-05`), client-bundle caching (`DSH-0.1.7-A2-04`), the plugin dist-tag rule (`R-04`), the three install-channel pitfalls (`R-08`), the type-surface export ledger (`R-11`), and the client-refresh vs host-restart plane rule plus the pnpm build-script rule (`migration-hygiene.md` §3–§4).

**Skipped (with reasons)**
* **No runtime introspection of the live host** (no `dsh --version`, no `cordis_inspect_*`): the host in this environment runs a different DSH version than the task's subject; per the boundary rules its facts are out of scope and wrong. The consumer's version was taken from the fixture's dsh-version capture.
* **No install, migration, publish, push, or profile mutation**, and no execution of the fixture's sync script (the pack is explicitly read-only; the script is quoted as evidence, never run).
* **No verification of the consumer's actual pnpm error text / exit code** — the brief only says "pnpm failed immediately"; the ref-lookup classification is derived from the tag inventory, not from the consumer's log.
* **No attempt to reach the two public mirrors** (no network) — all mirror facts come from the shipped `ls-remote` capture.

---

## 7. Pending / residual risk (Unconfirmed)

1. **`v0.9.1`'s exact target cohort** — no compat row; inferred from ordering (§4 R1). Confirm before finalising the consumer remedy. This is the single highest-value confirmation in this report.
2. **Whether `v0.9.5` (and `v0.9.2`–`v0.9.6`) exist in `origin`/`mirror2`** — only the public mirror's inventory is in the pack. Determines whether the fix is "push the missing tags" or "stop documenting refs that were never tagged".
3. **Whether the pack's sync-script excerpt is the whole script** — it is labelled an *excerpt*. If a tag-push line exists outside the excerpt, §5.1 item 1 must be re-scoped to a **verification gate** rather than a push.
4. **Whether the plugin is a `dsh.bundle` plugin or a plain plugin with a `cordis.patch.yml` insert row** — decides whether a host restart is required for the remedy to take effect (§4 step 2). Both paths are covered above.
5. **The exact `dsh plugin` removal sub-command grammar** for the crashed `v0.9.7` row — not present in the pack or the bundled references; the consumer should confirm it locally. Installing the replacement under the same alias is expected to replace the row.
6. **The consumer's exact pnpm error** — useful to confirm the ref-lookup classification (`ETARGET`/not-found) rather than a transport error.
7. **`v0.9.7`'s peer range** — not in the pack; §5.2 item 6 recommends declaring it, but the current value is unconfirmed and may be absent entirely, which would mean the plugin was never refused by any host.
8. **The `useConversation` provider on rc.2** — inferred from the compat table's own wording ("Migrated to the alpha.1 client API … useConversation seat") plus `DSH-0.1.2-A1-25` and the rc.2→alpha.1 package ledger. The pack does not contain rc.2's client surface, so the *direction* is proven by the compat table, while the *exact missing symbol* is corroborated, not directly observed.

---

## 8. Rollback

* **Baseline recorded:** the consumer's installed state before the remedy = plugin row at `#v0.9.7` (installs, crashes) and host `0.1.1-rc.2`; the maintainer's state = `origin` + `public` + `mirror2`, with the public mirror's tag set as captured in the fixture.
* **Consumer rollback:** re-install `#v0.9.7` to return to the (broken) previous state, or restore the profile's `package.json` row to its pre-change value; the host half is untouched, so rollback is a host restart + browser hard refresh away.
* **Maintainer rollback:** the §5.1 fix is **additive** (adding a tag push + a verification gate) and is reverted by deleting that line/step; §5.2 is **forward-only** (new peer ranges and a new prerelease version) and is reverted by publishing a follow-up version — a released tag is immutable, so the correction is always a new tag plus a README repoint, never a tag rewrite. This is exactly why the mirror must be pushed with tags and verified, rather than "fixed" by rewriting history.

---

## 9. Recommendations (ordered)

1. **Consumer, now (no dsh upgrade):** install **`#v0.9.1`** (§4 R1) — or **`#v0.9.3`** once the maintainer publishes the missing tags (R2) — then restart dsh and hard-refresh the browser. Never install the newest tag on rc.2.
2. **Maintainer, today:** push the missing tags `v0.9.2 … v0.9.6` to both public mirrors (this alone unblocks the documented `v0.9.3`), and add the README-ref lint + tag-set reconciliation gate so no future release can publish a README pin that does not resolve.
3. **Maintainer, next:** re-cut the alpha-cohort build as a prerelease plugin version under a prerelease dist-tag, declare per-cohort `peerDependencies`, and repoint the README to a per-host-version table. After that, "newest tag" and "right tag for your host" stop being the same object, and a wrong-line install on a modern host is refused at install time by the host itself (`DSH-0.1.7-RC1-01`) instead of crashing in the browser.
4. **Process:** treat the plugin's own release version and the DSH host corridor as separate coordinates throughout — in the changelog, the README table, the peer ranges, and the release automation. Every defect in this report is a symptom of collapsing the two.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.