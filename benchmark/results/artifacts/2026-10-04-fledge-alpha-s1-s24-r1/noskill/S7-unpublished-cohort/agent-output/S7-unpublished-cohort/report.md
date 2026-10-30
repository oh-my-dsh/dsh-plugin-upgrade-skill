# S7 Unpublished Cohort — Installation / Type-Baseline Plan (Read-Only)

Fixture (unchanged, not executed): `fixture/package.json` declares
`"devDependencies": { "@deepseek-ai/dsh-llm": "^0.1.2-alpha.1" }`;
README claims "npm install gives you the type baseline".

## 1. Real consequence of the declaration

- `^0.1.2-alpha.1` expands to `>=0.1.2-alpha.1 <0.2.0` (caret on a 0.x line is
  bounded below 0.2.0).
- Semver prerelease rule: a prerelease version is eligible only when a comparator
  in the range carries a prerelease on the same `[major,minor,patch]` tuple.
  The `>=0.1.2-alpha.1` comparator satisfies this for the `0.1.2` tuple, so
  `0.1.2-alpha.2` **is** eligible. Published `0.1.1-rc.1`/`0.1.1-rc.2` are **not**
  eligible (they are below `0.1.2-alpha.1` and on the `0.1.1` tuple).
- Therefore `npm install` does **not** fail: npm never needs to fetch the
  unpublished `alpha.1`; the caret range floats forward. Resolution should land on
  the highest published version satisfying the range — with the known cohort that
  is **`0.1.2-alpha.2`**. `alpha.1` being unpublished produces no error.
- Real consequence: the installed type baseline may differ from what the author
  intended (`alpha.1`'s typings), since you silently get `alpha.2` (or whatever
  the registry's newest matching prerelease is at install time). No lockfile is
  present in the fixture, so the baseline is non-reproducible. "npm install gives
  you the type baseline" is misleading: it gives you *some* baseline, not a
  pinned one.
- Unconfirmed (cannot verify from the fixture; no registry access was made):
  exact contents/diff of `dsh-llm@0.1.2-alpha.2` typings vs the intended
  `alpha.1`; whether `alpha.2` contains breaking type changes for this plugin;
  whether the registry today still lists exactly `0.1.1-rc.1 / 0.1.1-rc.2 /
  0.1.2-alpha.2`.

## 2. Installation / type-baseline plan (multiple paths)

Path A — Pin the real version (recommended, minimal):
- Edit `fixture/package.json` (when the maintainer is ready; not modified here):
  set `"@deepseek-ai/dsh-llm": "0.1.2-alpha.2"` (exact, no caret).
- Run `npm install --package-lock-only` or a real install to commit a
  `package-lock.json`, then verify the baseline compiles (e.g. `tsc --noEmit`
  if configured).
- Tradeoff: pins to alpha.2; you must diff its typings against the code's
  expectations and adjust. Exit path: revert to caret range or vendor.

Path B — Keep range, add lockfile + verify:
- Run `npm install`, commit the resulting lockfile, and diff
  `node_modules/@deepseek-ai/dsh-llm` typings against the plugin's usage.
- Tradeoff: still floats on fresh lockfile regeneration; must re-verify on each
  re-resolution. Exit path: tighten to Path A once a good version is identified.

Path C — Vendor / offline baseline:
- Obtain `@deepseek-ai/dsh-llm@0.1.2-alpha.2` tarball (or a mirrored copy),
  vendor it (e.g. `file:vendor/dsh-llm-0.1.2-alpha.2.tgz`), and generate a
  lockfile.
- Tradeoff: reproducible offline, but no upstream updates; must manage upgrades
  manually. Exit path: switch back to registry resolution once registry state is
  trusted again.
- Note: do not point the range at `0.1.1-rc.2` — it is *outside* the declared
  range and would silently downgrade the baseline; if `alpha.2`'s types are
  incompatible, either adopt `rc.2` deliberately (explicit pin + code review) or
  wait for a stable release.

Exit/upgrade path chung: track for a stable `0.1.2` (or later) release, at which
point re-run resolution, regenerate the lockfile, and re-verify types.

## 3. Verification limits

- No install, no registry access, no network search were performed per the brief;
  claims about published versions come from the task brief/README and are marked
  accordingly. Anything beyond them is "unconfirmed".
- Fixture remains byte-identical; no reproduction environment was created.
