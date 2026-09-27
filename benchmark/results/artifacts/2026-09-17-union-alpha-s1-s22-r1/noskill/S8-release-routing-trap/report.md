# S8 · Release Routing Trap — Diagnosis Report

## 1. Attempt-1 root cause: `#v0.9.5` cannot resolve

The tag listing (`ls-remote-tags.txt`) for the mirror `github:public-org/dsh-ui-progress` contains:

```
v0.1.0 … v0.9.0, v0.9.1, v0.9.7
```

**`v0.9.5` does not exist on the mirror.** Neither do v0.9.2–v0.9.4 and v0.9.6; v0.9.7 is the only tag above v0.9.1. This is not a network or command-typo problem — the ref simply is not there, so pnpm fails immediately at clone time.

The release-engineering defect is visible in the sync script excerpt (`sync-script.sh`):

```bash
for remote in origin public mirror2; do
  git push --force-with-lease "$remote" HEAD:main
done
```

The script pushes **only `HEAD:main`** — it never pushes tags (`git push ... --tags` or `refs/tags/*`). So the mirrors never receive the release tags; the branch tip is force-pushed on top of a tag-less history. The presence of exactly v0.9.1 and v0.9.7 (but nothing between) shows tags reach the mirrors only through some manual, ad-hoc action, not the release tooling. The README's install command pins a tag ref (`#v0.9.5`), so any consumer of the mirror hits this as soon as the pinned tag was never synced.

**Root cause: tag distribution defect — the mirror sync script omits tag pushes, so pinned tag refs referenced by the documented install command do not exist on the mirrors.**

## 2. Attempt-2 root cause: v0.9.7 installs but crashes

The compat table (`compat-table.md`) states:

| Plugin | Targets |
|---|---|
| v0.9.3 | npm @deepseek-ai/dsh@0.1.1-rc.1 (rc.2 is additive → also compatible) |
| v0.9.7 | dsh-v0.1.2-alpha.1 (migrated to the alpha.1 client API: views/legacy projection + the `useConversation` seat) |

The consumer's runtime (`dsh-version.txt`) is **0.1.1-rc.2**.

v0.9.7 is built against the **alpha.1 client API**; `useConversation` exists only from dsh 0.1.2-alpha.1 onward. On the consumer's rc.2 runtime that export does not exist, so the slot entry crashes with `TypeError: useConversation is not a function`. Restarting dsh cannot help — this is a static compatibility mismatch, not a stale-cache problem.

**Compatibility direction: the artifact (plugin v0.9.7) targets a *newer* DSH (0.1.2-alpha.1) than the consumer's runtime (0.1.1-rc.2).** The README's "bump to the newest tag" advice ignored its own compat table: on a pre-alpha.1 runtime the newest plugin is the *wrong* plugin; the newest *compatible* one is v0.9.3 (rc.1-verified, rc.2 compatible because rc.2 is additive over rc.1).

## 3. Exact remedy for the consumer right now

Constraint: the consumer stays on dsh 0.1.1-rc.2. v0.9.7 is incompatible, and v0.9.3 (the compatible release) is missing from the mirror's tags. The mirrors are therefore unusable for a compatible install; the consumer must install from the **primary repository** (the `origin` remote in the sync script — the upstream repo whose full tag history includes v0.9.3), pinned to the compatible tag:

```
dsh plugin --profile web add '@org/dsh-ui-progress@github:<origin-org>/dsh-ui-progress#v0.9.3'
```

where `<origin-org>` is the GitHub org of the maintainer's primary `origin` repository (the pre-mirror source of the same plugin). Key points:

- Pin **#v0.9.3**, not the newest tag: it is the newest release verified against the rc line (rc.1 real-boot; rc.2 is additive, so rc.2 is covered).
- Do **not** pin `#main` or an unversioned ref: the branch tip is the alpha.1-era code and would reproduce the attempt-2 crash.
- If the primary repo is not publicly reachable for the consumer, the maintainer-side fix below (re-sync tags) is the prerequisite; until then there is no resolvable compatible ref on the mirrors.

## 4. Maintainer-side fix so both defects cannot recur

**Release tooling (attempt-1):**

1. In the sync script, push tags with the branch:
   ```bash
   git push --force-with-lease "$remote" HEAD:main
   git push --force-with-lease "$remote" 'refs/tags/v*':refs/tags/v*
   ```
2. Make the sync script fail loudly instead of silently diverging: after each push, verify with `git ls-remote --tags "$remote"` that the release tag for the just-built version resolves on the mirror; abort the release if it does not (misconfiguration fails loud, never a silent partial sync).
3. Never delete or move tags on the primary repo; the force-with-lease protection applies to `main`, and tags should be append-only on mirrors.

**Docs / release policy (attempt-2):**

4. The README must not advertise "bump to the newest tag" unconditionally. Ship the compatibility table next to the install command and document the correct pin per runtime line: `#v0.9.3` for dsh 0.1.1-rc.x runtimes, `#v0.9.7` only for dsh ≥ 0.1.2-alpha.1.
5. Make the install command's default pin a *compatible* tag (currently v0.9.3), not the newest one, and state the required dsh runtime next to it. Ideally gate at load: the plugin should declare a minimum supported dsh client-API surface so a mismatched install fails with a clear compatibility message at plugin-load time rather than a `TypeError` inside a browser slot.
6. Keep the mirror tags and the README pin in one release step (the same release job that bumps the README pin also verifies the tag exists on every mirror), so a documented pin can never point at a ref the mirrors do not have.

## Summary

- Attempt 1: tag-distribution defect — the mirror sync script pushes only `HEAD:main`, never tags, so the documented pin `#v0.9.5` does not exist on the mirror.
- Attempt 2: version-routing defect — v0.9.7 targets dsh 0.1.2-alpha.1 (`useConversation` seat) while the consumer runs 0.1.1-rc.2; the newest tag is the wrong artifact for that runtime.
- Remedy now: install the newest rc-compatible release from the primary repo — `@org/dsh-ui-progress@github:<origin-org>/dsh-ui-progress#v0.9.3`.
- Prevention: push and verify tags in the release sync, and pin docs/install defaults to compatibility, not recency.
