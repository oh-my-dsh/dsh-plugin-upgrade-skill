# S8 · Release Routing Trap — Release-Engineering Diagnosis

Scope: static evidence pack under `fixture/` (read-only, unchanged). Evidence cards cited by
filename + key point only. Consumer constraint honored throughout: **dsh runtime stays at
0.1.1-rc.2** (production freeze); every remedy moves only the plugin side.

## 0. Evidence cards used

| Card ID | Key point |
|---|---|
| `ls-remote-tags.txt` | Mirror (`github:public-org/dsh-ui-progress`) tag set: v0.1.0 … v0.9.1, then v0.9.7. **v0.9.2–v0.9.6 absent, incl. v0.9.5.** |
| `sync-script.sh` | Release sync per remote (`origin public mirror2`): `git push --force-with-lease "$remote" HEAD:main` only — no tag refspec. |
| `dsh-version.txt` | Consumer runtime: `dsh --version` → `0.1.1-rc.2`. |
| `compat-table.md` | v0.9.3 ↔ npm @deepseek-ai/dsh@0.1.1-rc.1 (rc.2 = rc.1 + image preprocessing, **additive**); v0.9.7 ↔ dsh-v0.1.2-alpha.1 (migrated to alpha.1 client API: views/legacy projection + **useConversation seat**). |
| task brief | Attempt-2 symptom: `TypeError: useConversation is not a function`, persists after dsh restart. |

## 1. Attempt-1 root cause — `#v0.9.5` cannot resolve (tag-distribution defect)

**Not** a consumer network/command problem: the pinned ref does not exist on the remote.

- The README's install fragment `#v0.9.5` resolves to `refs/tags/v0.9.5` on
  `public-org/dsh-ui-progress`. The mirror's actual tag set (`ls-remote-tags.txt`) is
  v0.1.0–v0.9.1 plus v0.9.7 — there is no v0.9.5 (nor anything in v0.9.2–v0.9.6). pnpm
  resolves the `#<commit-ish>` fragment during git fetch; with no such ref on the remote,
  resolution fails immediately — matching "pnpm failed immediately".
- **Release-engineering defect:** `sync-script.sh` pushes only `HEAD:main` to each mirror
  and has **no tag refspec** (`--tags`/`--follow-tags`/`refs/tags/*:refs/tags/*` are all
  absent), so release tags created by the maintainer are never distributed to consumers.
  Worse, `--force-with-lease HEAD:main` **rewrites the published branch** on every release,
  so any release commit not on the current HEAD becomes unreachable on the mirror unless a
  tag happens to be pushed by hand. That is exactly the observed shape: a continuous tag run
  up to v0.9.1, a hole across v0.9.2–v0.9.6, and a lone v0.9.7 that must have been pushed out
  of band.
- Consequence: the docs and the distribution channel are out of sync — the README pinned a
  ref the release tooling never delivered. The same push treatment applies to every remote
  (`origin public mirror2`), so both public mirrors share the hole, and no step verifies
  that each documented ref exists on each mirror.
- Side effect worth noting: because untagged release commits are orphaned by the force push,
  consumers cannot even fall back to a SHA for v0.9.5 — tags are the only durable release
  handles, and they were never published.

## 2. Attempt-2 root cause — newest tag installs but crashes (version-routing defect)

- After the README was bumped to `#v0.9.7`, the ref *does* exist on the mirror
  (`ls-remote-tags.txt`) → fetch and install succeed.
- **Compatibility direction** (`compat-table.md`): plugin **v0.9.7 targets dsh-v0.1.2-alpha.1**
  — it migrated to the alpha.1 client API ("views/legacy projection + useConversation seat").
  The consumer runs **dsh 0.1.1-rc.2** (`dsh-version.txt`), i.e. the runtime is **older** than
  the DSH generation the newest artifact was built against (0.1.2-alpha.1 > 0.1.1-rc.2).
  Direction: *plugin too new for the runtime*, a forward-compatibility break.
- `useConversation` is a hook on the alpha.1 client API surface; 0.1.1-rc.x does not export
  it. When the plugin's slot entry renders and calls it, the browser throws
  `TypeError: useConversation is not a function` — an API-surface mismatch, not state or
  cache, which is why restarting dsh changes nothing.
- Nothing gates this at install time (the package installed cleanly), so the break surfaces
  only when the slot entry executes in the browser.
- The "bump the pin to the newest tag" fix fell into the routing trap: "newest" is not a
  compatibility statement. A consumer frozen on 0.1.1-rc.x must be routed to the plugin line
  built for that runtime.

## 3. Remedy for the consumer right now (runtime frozen at 0.1.1-rc.2)

**Target artifact: plugin v0.9.3** — the only release verified against 0.1.1-rc.1, and rc.2 is
rc.1 + image preprocessing (**additive**), so the client API surface is unchanged and v0.9.3
runs on the consumer's 0.1.1-rc.2. Do **not** install v0.9.7 (needs the 0.1.2-alpha.1 API) and
do **not** upgrade dsh.

Caveat that must be handled: the same tag-distribution defect leaves `refs/tags/v0.9.3`
missing from the mirrors (v0.9.2–v0.9.6 hole), so a bare `#v0.9.3` would repeat attempt 1.
Two working paths:

**(a) Preferred — maintainer publishes the missing tag first (seconds, no runtime change):**
```
git push public  refs/tags/v0.9.3:refs/tags/v0.9.3
git push mirror2 refs/tags/v0.9.3:refs/tags/v0.9.3
```
then the consumer runs exactly:
```
dsh plugin --profile web add '@org/dsh-ui-progress@github:public-org/dsh-ui-progress#v0.9.3'
```

**(b) If the tag cannot be pushed inside the consumer's window — pin the v0.9.3 commit by SHA**
(a commit-ish resolves regardless of tag distribution, as long as the commit is still reachable
on the mirror; verify first, because the force-pushed `main` may have orphaned it):
```
git fetch https://github.com/public-org/dsh-ui-progress.git <40-char-sha-of-v0.9.3>   # pre-check
dsh plugin --profile web add '@org/dsh-ui-progress@github:public-org/dsh-ui-progress#<40-char-sha-of-v0.9.3>'
```
If that fetch fails, path (a) is mandatory (re-push the tag/commit), because the sync script's
force push may have made the v0.9.3 commit unreachable on the mirrors.

**Explicitly not remedies:** `#v0.9.1` (resolvable but outside the verified compatibility
evidence), any "newest tag" pin, and upgrading dsh to 0.1.2-alpha.1 (would fix the crash but
violates the production freeze).

## 4. Maintainer-side fixes (both defects cannot recur)

**Release tooling**
1. **Distribute tags with the code.** Change the sync to push tag refs explicitly for every
   remote, alongside the branch update:
   `git push "$remote" "refs/tags/*:refs/tags/*"` (or `git push --follow-tags` with annotated
   tags). Keep the refspec explicit instead of relying on defaults.
2. **Stop force-pushing shared public mirrors.** `--force-with-lease HEAD:main` rewrites
   published history and orphans release commits; push immutable release tags and only
   fast-forward `main` (or push per-release branches). Whether a released commit survives must
   never depend on someone remembering to push a tag by hand.
3. **Post-sync verification gate that fails the release:** for each remote, diff local
   `git tag` against `git ls-remote --tags <remote>` and require every release tag to be
   present on every mirror; then smoke-test every documented pin
   (`dsh plugin add ...#<tag>`) against each supported DSH line in CI.
4. **Generate docs from one source of truth.** Emit the README install commands from the
   compatibility matrix, and assert in CI that every `#vX.Y.Z` mentioned in the README
   resolves on both mirrors (the same ls-remote check) — a pin may not name a ref the gate has
   not proven present.

**Docs**
5. **Route by runtime, not by "newest".** Put the compatibility matrix at the top of the README
   with one install command per supported DSH line, stating direction explicitly:
   "DSH 0.1.1-rc.x → `#v0.9.3`", "DSH 0.1.2-alpha.1 → `#v0.9.7`", plus the rule that a frozen
   consumer pins the plugin line matching its runtime.
6. **Document the two failure signatures** in a Troubleshooting section: *install fails to
   resolve* = missing ref (tag distribution) → publish/verify the tag; *installs but
   TypeError on a client-API hook* = version routing → install the plugin line matching the
   runtime. Never "fix" a resolution failure by bumping to the newest tag.
7. **Runtime guard (next release cycle):** declare the required DSH client-API generation in
   package metadata (`peerDependencies`/`engines` or an explicit `dsh.apiLevel`) and have the
   slot host refuse to load a plugin declaring a newer API level with a clear message, instead
   of a `TypeError` at render time. (Hardening only; it cannot help the frozen consumer today.)

## 5. Why this meets the consumer's constraint

The consumer's dsh stays at 0.1.1-rc.2. Only the plugin side moves (v0.9.7 → v0.9.3), and that
is the direction the compatibility table supports: v0.9.3 is built for the 0.1.1-rc.x client
API that 0.1.1-rc.2 keeps (rc.2 adds image preprocessing only), so the slot entry runs without
touching the alpha.1 `useConversation` seat.

## run-stats

- toolcalls 总数: 12（顶层 6 = run_code × 5 + send_message × 1；内含 glob × 1、read × 5、write × 4、mkdir × 2，其中 1 次 run_code 因时间格式化参数错误在写入前失败）
- token 用量: n/a（本会话未暴露用量计数）
- 完成时间: 2026-10-21 14:21:18 +08:00[Asia/Shanghai]（2026-10-21T06:21:18.509Z）
