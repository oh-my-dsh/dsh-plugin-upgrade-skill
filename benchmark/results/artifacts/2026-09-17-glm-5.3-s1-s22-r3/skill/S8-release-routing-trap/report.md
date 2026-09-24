# S8 · Release Routing Trap — Diagnosis Report

Mode A (read-only inspect) per the plugin-upgrade skill. All evidence is static, taken from
the fixture pack; no migrations, installs, or fixture writes were performed. Baseline
mechanical suite: not collected (read-only static fixture, no build target).

Fixture evidence used:

- ls-remote-tags.txt — `git ls-remote --tags https://github.com/public-org/dsh-ui-progress.git`
  shows exactly: v0.1.0 … v0.9.0, v0.9.1, **v0.9.7**. Tags v0.9.2–v0.9.6 (including the
  README-pinned v0.9.5 and the rc-compatible v0.9.3) are **absent from the mirror**.
- sync-script.sh — the per-release sync loop pushes only `HEAD:main` to each remote
  (origin / public / mirror2); it never pushes tags.
- compat-table.md — plugin v0.9.3 ↔ DSH 0.1.1-rc.1 (rc.2 is rc.1 + additive image
  preprocessing); plugin v0.9.7 ↔ DSH 0.1.2-alpha.1, "migrated to the alpha.1 client API
  (views/legacy projection + useConversation seat)".
- dsh-version.txt — the consumer's runtime is **0.1.1-rc.2**.

## 1. Attempt-1 root cause: why `#v0.9.5` could not resolve

The tag `v0.9.5` does not exist on the mirror the consumer installs from. The pnpm
resolver evaluates `github:public-org/dsh-ui-progress#v0.9.5` against that repository's
refs; `refs/tags/v0.9.5` is not in the ls-remote listing, so resolution fails immediately.
This is not a network or command problem — the ref genuinely is not there.

The release-engineering defect is in sync-script.sh: the per-release sync pushes only the
branch (`git push --force-with-lease "$remote" HEAD:main`) and never distributes release
tags to the mirrors. Tags are the install substrate for the documented pin syntax, so every
release since the script took over has published a commit on `main` without the matching
`refs/tags/v<x.y.z>`. The listing confirms the pattern: the mirror's tags stop at v0.9.1
(the last pre-script era) and jump straight to v0.9.7 (evidently pushed out-of-band, e.g. by
hand, for the newest release only). v0.9.2–v0.9.6 were never mirrored, so the README pin
`#v0.9.5` — and the version the consumer actually needs, v0.9.3 — are unresolvable from
`public-org`.

## 2. Attempt-2 root cause: why v0.9.7 installs but crashes

v0.9.7 exists on the mirror, so the install succeeds. The crash is a **DSH corridor
(version routing) mismatch, with the plugin ahead of the host**:

- The v0.9.7 artifact was migrated to the **0.1.2-alpha.1 client API** (per the plugin's own
  compat table: "views/legacy projection + useConversation seat"). `useConversation` is a
  0.1.2-alpha.1-era Web Client surface; the skill's corridor reference for the
  rc.2 → 0.1.2-alpha.1 edge (references/v0.1.2-alpha.1.md, cards DSH-0.1.2-A1-27 et al.)
  documents that this edge rewrote how plugins read the conversation/session timeline —
  the exact surface this plugin's slot entry consumes.
- The consumer's runtime is **0.1.1-rc.2**, one corridor older. Its client runtime does not
  export `useConversation`; the plugin bundle's import resolves to `undefined`, and the
  slot entry's first call throws `TypeError: useConversation is not a function` at
  registration/mount time in the browser.
- Restarting dsh cannot help: a restart only heals roster/combo staleness (the
  DSH-0.1.2-A1-20 class of self-healing). This is a static API-existence mismatch between
  a compiled plugin artifact and the host it runs against; it reproduces on every boot.

Compatibility direction, stated plainly: plugin v0.9.7 targets dsh **0.1.2-alpha.1**
(newer); the consumer runs dsh **0.1.1-rc.2** (older). The artifact is built for a host the
consumer does not have. The correct pairing for 0.1.1-rc.x is plugin v0.9.3.

## 3. Remedy for the consumer right now (runtime frozen at 0.1.1-rc.2)

Step 0 — stop the crash: remove the incompatible entry so the browser error stops:

```
dsh plugin --profile web remove '@org/dsh-ui-progress'
```

Step 1 — install the corridor-correct version, **plugin v0.9.3**, which the compat table
verifies against 0.1.1-rc.1 (rc.2 is rc.1 plus additive image preprocessing, so v0.9.3 is
compatible with the consumer's rc.2):

```
dsh plugin --profile web add '@org/dsh-ui-progress@github:<canonical-org>/dsh-ui-progress#v0.9.3'
```

**Important wrinkle (the layered half of this trap):** the `public-org` mirror the README
points at does **not** carry the v0.9.3 tag either — its tags jump from v0.9.1 to v0.9.7.
So the command above must target a remote that actually has the tag: the canonical origin
repository (or the second mirror). Before installing, verify the ref exists:

```
git ls-remote --tags <canonical-repo-url> | grep v0.9.3
```

The fixture does not record the canonical repo's coordinates (sync-script.sh names the
remotes origin/public/mirror2 without URLs), so the maintainer must supply the canonical
`<canonical-org>/dsh-ui-progress` coordinates — or, equivalently, push the missing tags to
`public-org` (see §4) and then install from it as usual. As a strictly secondary fallback
if no remote with v0.9.3 is reachable at all: `#v0.9.1` is present on the mirror and
predates the alpha.1 migration, so it targets the 0.1.1 client line — but the compat table
does not vouch for it, so treat it as unverified.

## 4. Maintainer-side fix (release tooling + docs)

Release tooling (sync-script.sh):

1. Distribute tags with every release. Replace the branch-only push with:
   ```bash
   git push --force-with-lease "$remote" HEAD:main --follow-tags
   ```
   (`--follow-tags` pushes annotated release tags reachable from HEAD; if release tags are
   lightweight, push them explicitly.)
2. One-time reconciliation of the already-broken mirrors — push the full tag set so the
   missing v0.9.2–v0.9.6 (including v0.9.3 and v0.9.5) become resolvable:
   ```bash
   git push "$remote" --tags
   ```
3. Add a post-sync verification gate: diff `git ls-remote --tags "$remote"` against the
   local `git tag -l` for every remote and **fail the release** if any released tag is
   missing anywhere the README points consumers at. The two observed failure modes (dead
   pin, unreachable compatible version) are both tag-distribution gaps this check closes.

Docs / version routing (README):

4. Stop shipping a single "default install command" pinned to one tag across DSH corridors.
   Publish the compatibility matrix in the README and give **per-DSH-version install
   commands**: 0.1.1-rc.x users → `#v0.9.3`; 0.1.2-alpha.1 users → `#v0.9.7`. Bumping the
   single default pin to the newest tag — as done for v0.9.7 — silently routes consumers on
   older runtimes to an artifact compiled against a client API their host does not export.
5. Declare the host corridor in the plugin manifest/package metadata (peer range or
   dsh-plugin.json compatibility field) so an artifact/host mismatch like v0.9.7-on-rc.2
   fails loudly at install time instead of as a browser `TypeError` at mount time.

## Skill-mode bookkeeping

- **Completed**: read-only evidence collection (all 5 fixture files), corridor grounding via
  references/v0.1.2-alpha.1.md, root-cause attribution for both attempts, consumer remedy,
  maintainer fix plan, this report.
- **Skipped**: runtime reproduction/mount smoke (Mode A is read-only and the fixture is
  static evidence only); scanning the canonical repo (coordinates not in evidence).
- **Pending/residual risk**: the canonical repository URL and mirror2's tag state are not in
  the fixture, so the concrete remedy command needs the maintainer to confirm the remote
  that carries v0.9.3; v0.9.1 fallback is unverified against the compat table.
- **Rollback**: nothing was changed anywhere (fixture untouched, no installs); no rollback
  required.
- **Recommendations**: adopt the dsh-community-standard manifest compatibility fields; add a
  per-release check that every corridor the compat table claims is actually installable
  from every mirror the README names.
