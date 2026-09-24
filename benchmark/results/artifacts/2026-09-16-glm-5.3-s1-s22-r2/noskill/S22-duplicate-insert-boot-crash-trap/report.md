# S22 · The Duplicate Insert That Crashed the Boot — Report

## 1. Root cause

**Colliding declarations.** Two `insert` rows for the *same loader entry id* `workspace-files` both resolve to the same plugin package `@deepseek-ai/dsh-api-workspace-files`:

1. The **web-app bundle's** `cordis.patch.yml` (npm-installed 0.1.5-alpha.2 tree, `packages/bundle/web-app/cordis.patch.yml`, L110–111 per `web-app-patch-excerpt.txt`) already ships:
   ```yaml
   - insert:
       - id: workspace-files
         name: '@deepseek-ai/dsh-api-workspace-files'
   ```
2. The **profile's** `cordis.patch.yml` (`C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml`) gained a manually appended, byte-for-byte identical row (last block of `profile-patch-excerpt.txt`).

**Where the collision is detected.** Not in the plugin itself, and not in the dsh CLI — it is the **Cordis plugin loader layer**, during composition of the plugin tree before any plugin code runs. The stack in `boot-crash-log.txt` shows the chain:

- `EntryGroup.update` in `@deepseek-ai/cordis-plugin-loader/lib/index.js:91` throws `duplicate loader entry id: workspace-files`;
- that is raised through `Include._apply` ("failed to apply loader entry include (cordis:include)") while evaluating the `include`/patch entries;
- `dsh-app-boot` `boot()` wraps it as "plugin tree failed to load", surfaced by `runProfile` → `runCli`.

So the duplicate-id check is an invariant of the loader's `EntryGroup`: entry ids must be unique across everything the profile pulls in (bundle patch + profile patch). The loader refuses the *whole boot* rather than accepting the later row because entry id uniqueness is a structural precondition for building the plugin tree — the loader cannot decide which of two rows for one id is authoritative (they could carry conflicting config/ordering), so it fails loud at load time (the repo's "misconfiguration fails loud at load" rule) instead of silently picking a winner.

The maintainer's original symptom (文件资源服务不可用) was misdiagnosed: the bundle already provides `workspace-files` in 0.1.5-alpha.2, so a missing composition row was not the cause.

## 2. Layering rules for a profile patch acting on a bundle-provided plugin

| Operation | Verdict |
|---|---|
| Changing the plugin's **config by id** (e.g. a `config` override for `workspace-files`) | **Safe** — it targets an existing entry; the loader merges config rather than re-registering the id. |
| Adding an insert row for an id **no bundle ships** (genuinely new/external plugin, like the profile's `dsh-file-trace` / `dsh-profiles` rows) | **Safe** — that is exactly what profile patches are for. |
| Adding an insert row for an id **a bundle already ships** | **Fatal** — duplicate loader entry id, boot crash. |

**The maintainer's action is the fatal third case.** The proving evidence row is the bundle's `web-app-patch-excerpt.txt` block:

```yaml
- insert:
    - id: workspace-files
      name: '@deepseek-ai/dsh-api-workspace-files'
   ```

combined with the identical final block in `profile-patch-excerpt.txt`. The adjacent bundle rows (`session-controller`, `settings-controller`) show the pattern: bundle-provided plugins are listed only in the bundle patch and never duplicated in the profile patch. Ironically, the maintainer's own comment in the profile patch ("如果 web-app bundle 已包含此行则此条为冗余；保留以确保…") flagged the exact risk but guessed wrong about the consequence — "redundant" here is not harmless, it is boot-fatal.

## 3. Fix

**Minimal correct change:** delete the manually added `workspace-files` insert block (the two `insert` lines plus its leading comment lines) from the **profile's** `C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml`. No change to the bundle, the plugin, or the profile's other rows. After that, `dsh web` boots and `workspace-files` is provided solely by the web-app bundle patch, exactly like `session-controller` and `settings-controller`.

**Is the plugin at fault?** No. `@deepseek-ai/dsh-api-workspace-files` never executed — the crash happens in loader entry-group composition before any plugin code is applied. **Could any plugin-side change fix it?** No: the failure is a structural duplicate-id violation in the composed patch tree; only removing one of the two identical entries (and the profile row is the one to remove, since the bundle owns the id) resolves it.

Note also that removing the duplicate fixes the *crash*, but the original "文件资源服务不可用" read failure had some other cause (service availability/registration at runtime under 0.1.5-alpha.2) and needs separate diagnosis; duplicating the entry was never a valid remedy for it.

## 4. Prevention

**Maintainer-side, before hand-adding an insert row:**
- Inspect the installed bundle's patch: `cordis.patch.yml` of the active bundle in the installed tree (e.g. `...\node_modules\@deepseek-ai\dsh\node_modules\...` / `packages/bundle/web-app/cordis.patch.yml`) and grep it for the entry id (here `workspace-files`) before inserting. If the id exists there, the bundle already provides it — the profile patch must not re-insert it; use a config-by-id override instead if tuning is needed.
- Treat any comment saying "可能冗余" as a stop signal to actually verify against the bundle, not a reason to keep the row.
- Prefer diagnosing a runtime "service unavailable" symptom at runtime (check whether the service registered, its logs) rather than assuming a missing composition row.

**Host-side (actionable boot diagnostics):** when `EntryGroup.update` detects a duplicate id, the host could print, before the raw stack:

- **Whom to blame:** which two sources contributed the colliding entries — e.g. "loader entry id `workspace-files` is inserted by both the web-app bundle patch (…\packages\bundle\web-app\cordis.patch.yml, L110) and the profile patch (C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml)";
- **What to delete:** "remove the duplicate `insert` for `workspace-files` from your profile patch — the bundle already provides it; keep bundle-provided ids out of profile inserts, or override config by id instead."

That converts an opaque `TypeError: duplicate loader entry id` into a one-step remediation message.
