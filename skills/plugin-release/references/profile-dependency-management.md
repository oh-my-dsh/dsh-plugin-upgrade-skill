# Profile dependency management recipes

> Carries on the release-track choice of [../SKILL.md](../SKILL.md). This document covers the dependency-resolution facts and operational recipes for installing/updating plugins into `$DSH_HOME/profiles/*`, drawn from the continuous migration of the 17 plugin repositories across three version steps (0.1.0-rc.8 → 0.1.1-rc.2 → 0.1.2-alpha.1 → 0.1.2-alpha.2 → 0.1.2-alpha.3). Technical migration pitfalls
> (tsbuildinfo, oxc parsing, etc.) are covered in [migration-hygiene](https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill/blob/main/skills/plugin-upgrade/references/migration-hygiene.md);
> this document does not repeat them.

## 1. Resolution facts for the two install tracks

| Declaration | Resolution behavior | Applies to |
|---|---|---|
| `link:<absolute path>` | Directory junction/symlink straight to the local directory; no version resolution | Local development, during batch migration |
| `github:owner/repo` | Resolves the default-branch HEAD; the lockfile records the exact commit of the source archive URL (codeload) | Release installs, consumer side |

The two tracks can be mixed within one profile; handle renames, migration, and wrap-up per the items below.

## 2. The github dependency lock-cache pitfall: `Already up to date` does not mean you got the new commit

**Symptom**: a new commit was pushed upstream, `pnpm install` prints `Already up to date`, and the codeload URL in the lockfile is still the old commit; the code loaded at startup is still the old code.

**Cause**: pnpm caches HEAD resolution for github dependencies; a regular `install` does not re-resolve.

**Fix**:

```sh
# Force re-resolution of the github dependency (run for the web and headless profiles separately)
cd "$DSH_HOME/profiles/web" && pnpm update <pkg>
# Verify that the commit in the lockfile equals the expected HEAD
grep 'codeload.*<pkg>' pnpm-lock.yaml   # should be tar.gz/<40-char commit>
```

During batch-migration wrap-up, run `pnpm update` once for every github-track dependency, then verify the commit.

## 3. Three-place sync when a plugin's npm package is renamed (package name prefix change)

When the package name changes from `@deepseek-ai/dsh-x` to `@org/dsh-x`, the following three places must agree, or the Loader fails to resolve:

1. the dependencies key in the profile `package.json` (install name);
2. the profile `dsh.profile.bundles` entry (bundle name);
3. the `name` line in the plugin's own `cordis.patch.yml`.

**Residue cleanup**: after a rename, `pnpm install` may keep the old-name directory junction (old and new directories coexist). After confirming that the lockfile contains only the new name, manually delete the leftover `node_modules/@old-prefix/old-package` directory.

## 4. Update semantics of the shared fallback node_modules and directory junctions

- The profile's own `node_modules` contains only the profile's declared dependencies; when a bare row name fails to resolve, resolution falls back to the shared `$DSH_HOME/profiles/node_modules` (which holds copies of the app's and each bundle's declared dependencies).
- When a directory junction points at a local workspace package, **a workspace source update takes effect once dsh is restarted**; host-half changes require a restart, and only then can the client half hard-refresh (see item 3 of [migration-hygiene](https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill/blob/main/skills/plugin-upgrade/references/migration-hygiene.md)).
- The profile root `cordis.yml` is rewritten to `[]` at boot (composition facts live in the patch layer) — **do not edit it by hand**; edit `cordis.patch.yml` instead.

## 5. Profile linkage order after a host tag upgrade

1. Check out the exact tag → `pnpm install` → `pnpm run clean` → `pnpm run build` (clean rules out tsbuildinfo false positives);
2. After the batch plugin migration is done and pushed to each repository, return to the profile: `pnpm update` re-resolves the github-track dependencies;
3. Verify the row set with `dsh --profile <p> --dump-config`;
4. Real cold boot: once dsh at the target tag is up, the plugin's entry in the plugin inventory (pluginInventory) is `active`, with no `pending`.

## 6. Browser-free authentication smoke for custom channels

Since 0.1.2-alpha.1, dsh web uses bootstrap-token + signed-Cookie authentication (see
[DSH-0.1.2-A1-08 · Web/API channel authentication](https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill/blob/main/skills/plugin-upgrade/references/v0.1.2-alpha.1.md)).
When a plugin has its own HTTP/RPC channel (such as `/tariff/status`), use the flow below before publishing to prove that "the channel really sits behind the unified authentication", without relying on a browser/Playwright. Known behavior: the token can be exchanged repeatedly within the same process and only rotates on restart; a custom route inherits authentication only when registered through `connection` — a bare `ctx.webServer.register()` does not inherit.

PowerShell (with its own Cookie container):

```powershell
# 1. Grab the auth URL from the startup output: dsh web: http://127.0.0.1:3190/?token=<T>
# 2. Exchange the Cookie
$sess = New-Object Microsoft.PowerShell.Commands.WebRequestSession
Invoke-WebRequest "http://127.0.0.1:3190/?token=$token" -WebSession $sess -UseBasicParsing
# 3. Call the custom channel with the session → assert 200
$body = @{ type = 'client-request'; rpcId = 'smoke'; method = 'status'; payload = $null } | ConvertTo-Json
Invoke-WebRequest 'http://127.0.0.1:3190/tariff/status' -Method POST -ContentType 'application/json' -Body $body -WebSession $sess
# 4. Resend without authentication → assert 401 (proves the channel is protected)
Invoke-WebRequest 'http://127.0.0.1:3190/tariff/status' -Method POST -ContentType 'application/json' -Body $body
```

curl equivalent (`-c/-b` cookie jar):

```sh
curl -s -c jar.txt "http://127.0.0.1:3190/?token=$TOKEN" >/dev/null      # exchange the Cookie (303→/)
curl -s -b jar.txt -X POST -H 'content-type: application/json' \
  -d '{"type":"client-request","rpcId":"smoke","method":"status","payload":null}' \
  http://127.0.0.1:3190/tariff/status        # expect 200
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  http://127.0.0.1:3190/tariff/status        # expect 401
```

## 7. Validation checklist

- [ ] Every github dependency's commit in the lockfile equals the expected HEAD;
- [ ] A renamed plugin uses the same name in the lockfile, the bundles list, and `cordis.patch.yml`, and the old directory junction has been cleaned up;
- [ ] The `--dump-config` row set matches expectations;
- [ ] Real cold boot leaves the entry active;
- [ ] Custom-channel authentication smoke: 401 without authentication, 200 after exchanging the Cookie (Section 6 flow).

## 8. Plugin version must be routed by DSH version (a wrong pick crashes)

Different versions of the same plugin target different DSH versions. The DSH client API is
**forward-incompatible across rc.x → alpha.x**: a plugin built for the wrong DSH version does not
degrade gracefully — it crashes at runtime with a symptom that looks unrelated to the plugin.

**Symptom**: console `TypeError: useConversation is not a function` (or another missing slot seat);
"restart, hot-reload, edit cordis.patch.yml" all fail to fix it.

**Root cause**: a plugin built against the `0.1.2-alpha.1` client API was installed into
`0.1.1-rc.2` (npm latest). The two client contracts differ, so the plugin reads a seat the host
never provided.

**Fix**: pick the plugin version matching the DSH version. Put a one-glance version matrix at the top
of the plugin README:

| Your DSH | Plugin version to install |
|---|---|
| `0.1.1-rc.2` (npm latest) | the old (rc.1/rc.2-compatible) version, using its pinned tag |
| `0.1.2-alpha.1 / alpha.2` | the new version (the default command) |

Give consumers a self-check clue in a README callout: *a wrong pick crashes; common symptom
`useConversation is not a function`*. Do not expose only a "latest version" default command — that
sends rc.x users to a forward-incompatible build.

## 9. Every tag referenced by the docs must exist on every mirror

**Symptom**: installing by the README's pinned tag fails with
`Could not resolve vN.N.N to a commit of https://github.com/<org>/<repo>.git`.

**Root cause**: the repo is distributed across mirrors (private primary + public mirrors), but the
publish/sync script pushes branches only, never tags — historical tags never reached the public
mirrors, so the version pinned in the docs cannot be resolved.

**Fix** (both parts):

1. The publish/sync script must append `git push <remote> --tags` (non-forced) after each branch
   push, so every release tag is synced to all mirrors;
2. Consumers can confirm a tag exists first with
   `git ls-remote --tags https://github.com/<org>/<repo>`.

**Maintainer self-check after a release**: verify across mirrors with the API — query
`repos/<org>/<repo>/git/refs/tags/<tag>` per tag and re-push any that are missing. This is the same
class of check as "lockfile commit equals expected HEAD" (Section 2): if the docs say it installs,
it must actually install.
