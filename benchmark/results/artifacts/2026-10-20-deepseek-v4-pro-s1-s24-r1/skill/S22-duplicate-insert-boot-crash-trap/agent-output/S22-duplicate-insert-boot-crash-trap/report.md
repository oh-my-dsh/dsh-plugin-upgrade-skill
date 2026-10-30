# S22 — The Duplicate Insert That Crashed the Boot

## 1. Root cause

The two declarations that collide are both `- insert` rows with `id: workspace-files`
mapping to `@deepseek-ai/dsh-api-workspace-files`:

- **Bundle-provided row** — the 0.1.5-alpha.2 web-app bundle's own `cordis.patch.yml`
  (`packages/bundle/web-app/cordis.patch.yml`, L110-111 of the installed tree), shown in
  `web-app-patch-excerpt.txt`. The `workspace-files` row (plus `resources`,
  `ui-sidebar-right`, `ui-sidebar-textpreview`, `ui-sidebar-files`) is shipped by the
  bundle since 0.1.5-alpha.1 — the "web-app patch rows" of DSH-0.1.5-A1-16.
- **Profile row** — the maintainer's manual insert appended to the profile
  `C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml`, shown in
  `profile-patch-excerpt.txt`, carrying the wrong "redundant if the web-app bundle already
  contains this row" comment.

**Collision layer:** the Cordis plugin-loader layer. The crash stack shows
`cordis-plugin-loader/lib/index.js → EntryGroup.update` throwing, reached via
`Include._apply` (`cordis:include`) inside `dsh-app-boot`'s `boot`. The duplicate id is
detected when the loader applies the `cordis:include` entry and tries to register a second
entry under an id already present in the entry group.

**Why refuse the whole boot instead of accepting the later row:** `EntryGroup.update` treats
a duplicate entry id as a hard invariant violation (it throws a `TypeError`, not a
warn-and-continue). Two distinct `insert` declarations for the same id are ambiguous — there
is no defined "later wins" merge for loader-entry composition, and silently dropping one
would let the tree run with only half of a layer's intent. The loader therefore fails closed:
it aborts the whole `cordis:include` application and the profile boot rather than guess which
of the two declarations is authoritative. The failure happens at composition time, before any
plugin code (including `dsh-api-workspace-files` itself) is loaded.

## 2. Layering rules (profile patch acting on a bundle-provided plugin)

| Operation | Result |
|---|---|
| Change the plugin's **config by id** (config/set merge keyed on the existing id, no new `insert` row) | **Safe** — layers config over the bundle's declaration without re-declaring the entry |
| Add a row for an id **no bundle ships** (a genuinely external plugin, e.g. `dsh-file-trace`, `dsh-profiles` in the excerpt) | **Safe** — normal profile composition |
| Add a row for an id a **bundle already ships** (`insert` with `id: workspace-files`) | **Fatal** — duplicate loader entry id → boot crash |

The maintainer's action is the **third (fatal) case**: they added an `insert` row for
`workspace-files`, an id the web-app bundle already ships. The evidence row that proves it is
the `workspace-files` insert in `web-app-patch-excerpt.txt` — the profile's manual row is a
duplicate of that bundle row, and `boot-crash-log.txt` names exactly this id.

## 3. Fix

**Delete the manual block from the profile patch** — remove the entire trailing
`workspace-files` `- insert` stanza (and its misleading comment) from
`C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml`. No row needs to be added: the bundle
already provides `workspace-files`.

**Is the plugin's own code at fault?** No. `@deepseek-ai/dsh-api-workspace-files` is
irrelevant to this failure — the error is a pure composition/loader-layer duplicate, raised
before any plugin code runs. **No plugin-side change can resolve the boot failure**, because
the loader never reaches the plugin; the only correct change is on the profile patch.

The maintainer also misdiagnosed the *original* symptom ("file resource service unavailable"
when opening the right-sidebar document tab). That symptom matches DSH-0.1.5-A1-20: an
in-place npm-global upgrade can serve a client combo that omits newly-added bundle modules on
the first post-upgrade boot, and a host restart self-heals the roster/combo mismatch. So the
correct recovery is: **remove the duplicate insert, then restart the host** (which also heals
the original file-surface gap), rather than hand-adding a row.

## 4. Prevention

- **Before adding any row by hand**, the maintainer should inspect the installed bundle's own
  patch — `<npm global root>/node_modules/@deepseek-ai/dsh/.../bundle/web-app/cordis.patch.yml`
  (and the boot manifest / `--dump-config` resolved composition) — to check whether the id is
  already shipped, and add a profile row only for ids the bundle does *not* already provide.
  (A1-16 shows the bundle owns `workspace-files` and the other sidebar rows.)
- **What the host should print at boot** to make this actionable: instead of a bare
  `duplicate loader entry id: workspace-files`, report *both* sources of the duplicate and the
  ownership — e.g. `duplicate loader entry id 'workspace-files': declared by profile patch
  <profile cordis.patch.yml> and by bundle <web-app/cordis.patch.yml>; delete the manual row
  from the profile patch`. That names **whom to blame** (the profile-patch author, not the
  plugin and not the bundle) and **what to delete** (the specific block/file), turning the
  current fail-closed crash into a self-service recovery.
