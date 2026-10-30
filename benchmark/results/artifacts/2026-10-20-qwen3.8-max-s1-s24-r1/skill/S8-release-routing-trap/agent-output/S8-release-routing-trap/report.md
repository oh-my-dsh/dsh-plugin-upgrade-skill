# S8 · Release Routing Trap — Diagnosis Report

Mode: read-only inspection/diagnosis (skill plugin-upgrade, Mode-A discipline). Evidence base: the static
pack in `/app/fixture/` (unchanged, byte-for-byte), plus skill corridor cards cited by ID only.
No installs, migrations, network access, or git operations were performed.

## Evidence inventory (fixture)

| File | Fact used |
|---|---|
| `ls-remote-tags.txt` | Authoritative tag listing of the public mirror `github.com/public-org/dsh-ui-progress`: v0.1.0 … v0.9.0, v0.9.1, then **v0.9.7 only**. Tags v0.9.2–v0.9.6 (incl. **v0.9.5** and **v0.9.3**) do **not** exist on the mirror. |
| `dsh-version.txt` | Consumer runtime: `dsh --version` → **0.1.1-rc.2** (production freeze; cannot upgrade). |
| `compat-table.md` | Plugin↔host compatibility: **v0.9.3 ↔ npm @deepseek-ai/dsh@0.1.1-rc.1** (rc.1 real-boot verified; rc.2 = rc.1 + additive image preprocessing); **v0.9.7 ↔ dsh-v0.1.2-alpha.1** (migrated to the alpha.1 client API: views/legacy projection + `useConversation` seat). |
| `sync-script.sh` | Release sync excerpt: for each mirror remote it rewrites install-source orgs and runs `git push --force-with-lease "$remote" HEAD:main` — **the branch only; no tag refspec, no `--tags`/`--follow-tags`**. |

## 1. Attempt-1 root cause — `#v0.9.5` could not resolve (tag-distribution defect)

The install command is structurally correct; the ref it pins does not exist on the mirror it points at.
`ls-remote-tags.txt` proves the public mirror carries v0.9.1 and then jumps to v0.9.7: **there is no
`v0.9.5` tag** (nor v0.9.2–v0.9.6). pnpm resolves a `github:owner/repo#tag` specifier by asking git for
that exact ref; an unknown ref is a deterministic, immediate resolution failure — which matches "pnpm
failed immediately". This is not the consumer's network or command syntax: the identical command shape
succeeded minutes later for `#v0.9.7`, and the failure is ref-not-found, not transport.

The release-engineering defect is visible in `sync-script.sh`: the per-mirror release sync pushes only
`HEAD:main` (with org rewriting, force-with-lease). **Release tags are never distributed to the mirrors.**
The mirror's contiguous v0.1.0–v0.9.1 tags indicate tags reached it only during an earlier era/process;
every release tagged after that (v0.9.2–v0.9.6, incl. the README-pinned v0.9.5) exists only on the
maintainer's origin. v0.9.7's lone presence is consistent with an ad-hoc/manual push of just the newest
tag (inference — the fixture does not record how it arrived). Because the same script runs for every
mirror remote, the tag gap affects **both** public mirrors identically.

Defect class: **tag distribution** — release tooling syncs branches but not tags, and nothing verifies
that the ref pinned in the README actually resolves on each public mirror before the release is announced.

## 2. Attempt-2 root cause — `#v0.9.7` installs but crashes (version-routing defect)

Compatibility direction, from `compat-table.md` + `dsh-version.txt`:

- Artifact: plugin **v0.9.7** was **forward-migrated to the DSH 0.1.2-alpha.1 client API** — it consumes
  the alpha.1 session-view surface (views/legacy projection + the `useConversation` seat).
- Runtime: the consumer's host is **0.1.1-rc.2**, one corridor edge older. In the rc.2→alpha.1 edge the
  whole client surface was rebuilt: session-view internals were split up (card **DSH-0.1.2-A1-03**) and
  `@deepseek-ai/dsh-client-runtime` was removed with client symbols redistributed to owning packages
  (card **DSH-0.1.2-A1-25**). The `useConversation` seat is an alpha.1-era surface and **does not exist
  on 0.1.1-rc.2**; the import resolves to `undefined`, and calling it at slot mount throws exactly
  `TypeError: useConversation is not a function`.

So the artifact is **newer than the runtime** (plugin built for alpha.1 installed on an rc.2 host) — not a
stale artifact on a new host. Restarting dsh cannot help: this is a static API-surface mismatch, not a
transient boot issue. The install itself succeeded because nothing gates host compatibility on this
runtime: host-side DSH peer-range enforcement at install/startup only arrives in 0.1.7-rc.1 (far newer
than the consumer's host), and the plugin evidently declares no checked engines/peer range of its own —
so pnpm happily fetches the tag and the failure is deferred to browser mount time.

Defect class: **version routing** — the README's single "newest tag" default routes every consumer to the
latest artifact regardless of which DSH line they run, and neither the package metadata nor the client
entry fails fast on a host mismatch.

Note the two failures are independent: fixing one does not fix the other. v0.9.5 failed on *distribution*
(tag absent), v0.9.7 failed on *routing* (tag present, wrong host corridor).

## 3. Exact remedy for the consumer right now (host frozen at 0.1.1-rc.2)

The consumer needs the newest plugin built on the **pre-alpha.1 (rc.1-era) client API**. Per the compat
table that is the **v0.9.3 line**: v0.9.3 is real-boot verified on 0.1.1-rc.1, and the rc.1→rc.2 edge is
additive-only image preprocessing (cards **DSH-0.1.1-R2-01/02/03** — attachment dimensions, read_image
scaling facts, Files-API preference; no client-API removals), so an rc.1-era plugin remains API-compatible
on rc.2. **But v0.9.3 is also missing from the mirror** (same tag-distribution defect as v0.9.5) — pinning
`#v0.9.3` today would reproduce attempt-1's failure on both mirrors.

**Immediately executable, self-service** — newest pre-migration tag that actually exists on the mirror
(v0.9.1; everything ≤ v0.9.3 predates the v0.9.7 alpha.1 migration):

```
dsh plugin --profile web add '@org/dsh-ui-progress@github:public-org/dsh-ui-progress#v0.9.1'
```

Then verify: the slot entry mounts without TypeError and one core plugin path renders. Residual caveat:
the compat table verifies v0.9.3, not v0.9.1 — the *host-API* surface is the same rc.1-era line, but
plugin-level features/fixes added in v0.9.2–v0.9.3 will be absent.

**Preferred, needs one cheap maintainer action (still no dsh upgrade)** — maintainer pushes the missing
tag(s) to both mirrors (see §4.1), after which the consumer re-pins to the verified release:

```
dsh plugin --profile web add '@org/dsh-ui-progress@github:public-org/dsh-ui-progress#v0.9.3'
```

Explicit non-remedies: `#v0.9.7` on 0.1.1-rc.2 (crashes, §2); `#v0.9.5` or `#v0.9.3` against the
mirrors **as they stand today** (tags absent, §1); upgrading the dsh host (production freeze — and the
remedy must not depend on it).

## 4. Maintainer-side fix so neither defect can recur

### 4.1 Release tooling

1. **Distribute tags in the sync script.** After the branch push, push the release tag to every mirror
   with the same org rewrite, e.g. `git push "$remote" "refs/tags/$TAG:refs/tags/v$VER"` (or
   `--follow-tags` for annotated tags). Tags must be pushed **without force** (immutable coordinates);
   reconsider the force-with-lease rewrite of `main` itself — force-pushing public branches breaks
   commit-pinning consumers and makes tags the only stable ref, which is exactly what was not synced.
2. **Post-release verification gate (fail the release, not the consumer).** For each mirror run
   `git ls-remote --tags <mirror-url>` and assert: (a) the just-created tag is present; (b) **every tag
   pinned anywhere in README/docs is present**; (c) optionally a dry-run pnpm resolution of the documented
   install command succeeds against each mirror. This single gate would have caught both the v0.9.5 pin and
   the v0.9.2–v0.9.6 gap before any consumer hit them.
3. **Machine-readable + enforced compatibility routing.** Declare the supported DSH host range in
   `package.json` (`peerDependencies`/`engines`) and in the plugin manifest (`dsh-plugin.json`
   compatibility metadata), and make the client entry **feature-detect at mount** (presence of the
   `useConversation` seat / host boot-manifest version) and fail with an explicit message —
   "dsh-ui-progress v0.9.7 requires DSH ≥ 0.1.2-alpha.1; this host is 0.1.1-rc.2 — install #v0.9.3" —
   instead of a bare TypeError. Host-side peer enforcement (0.1.7-rc.1, with `compatibility.json`
   exemptions) does not protect older hosts, so the plugin-side declaration and guard is what actually
   covers the 0.1.1-era installed base.
4. **Keep a maintained legacy line across a breaking host migration.** When v0.9.7 moved to the alpha.1
   API, continue patch releases of the rc.1-era line (e.g. v0.9.x-legacy) for frozen consumers, and keep
   its last tag distributed and documented.
5. **Generate the README pin from the release pipeline** (never hand-edit a tag that has not passed gate
   2), or publish per-line stable aliases (e.g. `#stable-rc1`) that the pipeline repoints only after
   mirror verification.

### 4.2 Docs

1. README must present **per-runtime-line install commands next to the compatibility table**, not a single
   "newest tag" default — e.g. "DSH 0.1.1-rc.1/rc.2 → `#v0.9.3`; DSH 0.1.2-alpha.1+ → `#v0.9.7`" —
   with the instruction to check `dsh --version` first.
2. Show the exact public mirror org/path in each command (the sync script rewrites orgs per mirror;
   GitHub owner/repo and registry scope are independent coordinates and must not be derived from one
   another).
3. Annotated tags / release notes must state the required DSH host version, so consumers can self-route
   without reading the plugin source.
4. Add a troubleshooting row for the two signature symptoms: "pnpm fails immediately on #tag" → tag not
   distributed to that mirror (run `git ls-remote --tags`); "`TypeError: useConversation is not a
   function`" → artifact newer than host, downgrade the plugin tag per the compat table.

## Boundaries & discipline

- `/app/fixture/` untouched (read-only inspection only); no migrations, installs, executions, git
  operations, or external network access; report and this file are the only writes, under
  `/app/agent-output/S8-release-routing-trap/`.
- Skill references cited by card ID + gist only: DSH-0.1.1-R2-01/02/03 (rc.1→rc.2 additive image
  preprocessing), DSH-0.1.2-A1-03 (session-view internals split; legacy projection / seats field note),
  DSH-0.1.2-A1-25 (`dsh-client-runtime` removed, client symbols migrated by domain); 0.1.7-rc.1 peer-range
  enforcement noted as corridor context.
