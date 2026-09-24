# S8 · Release Routing Trap — Diagnosis Report

## Evidence basis (fixture, read-only)

- `ls-remote-tags.txt`: tags on the public mirror are `v0.1.0 … v0.9.0, v0.9.1, v0.9.7`. Tags **v0.9.2–v0.9.6 are absent**, including `v0.9.5`.
- `sync-script.sh`: the post-release sync script loops over mirrors and runs only `git push --force-with-lease "$remote" HEAD:main`. **It never pushes tags.**
- `compat-table.md`: plugin v0.9.3 targets `npm @deepseek-ai/dsh@0.1.1-rc.1` (rc.2 is additive, so compatible); plugin v0.9.7 targets `dsh-v0.1.2-alpha.1` ("Migrated to the alpha.1 client API — views/legacy projection + `useConversation` seat").
- `dsh-version.txt`: the consumer's runtime is **dsh 0.1.1-rc.2**.

---

## 1. Attempt-1 root cause: `#v0.9.5` cannot resolve

**Defect: tag distribution failure in the release sync tooling.** The sync script pushes only the `main` branch to each mirror and never pushes tags (`--follow-tags`, `--tags`, or explicit tag refs). As a result the mirror's tag set is incomplete — `v0.9.5` (and everything between v0.9.2 and v0.9.6) simply does not exist on `public-org/dsh-ui-progress`. When pnpm's git resolver tries to check out the pinned ref `#v0.9.5`, git cannot resolve the ref and the install fails immediately. This is not a network or command problem on the consumer's side; the README pins a tag that the documented mirror never received. (`v0.9.7` is present presumably because it was pushed once by hand, outside the script.)

## 2. Attempt-2 root cause: newest tag installs but crashes

**Defect: version routing / compatibility-direction mismatch.** Plugin v0.9.7 is built against the **newer** DSH `0.1.2-alpha.1` client API — it calls `useConversation`, which exists only in that alpha client. The consumer's runtime is **0.1.1-rc.2**, which predates the alpha API and does not export `useConversation`. Direction: the **plugin artifact targets a DSH version newer than the consumer's runtime** (forward-targeting), while the consumer needs an artifact targeting their current 0.1.1-rc line.

The install itself succeeds because nothing along the install path encodes or enforces the required DSH runtime version (no runtime/peer check at activation). The failure surfaces only at slot render time in the browser as `TypeError: useConversation is not a function` — a static API mismatch, which is why restarting dsh cannot help.

## 3. Remedy for the consumer (works on runtime 0.1.1-rc.2, no runtime upgrade)

Per the compat table, the last plugin version targeting the 0.1.1-rc line is **v0.9.3** (verified on rc.1; rc.2 is additive, hence compatible), and that tag *does* exist on the mirror:

```
dsh plugin --profile web add '@org/dsh-ui-progress@github:public-org/dsh-ui-progress#v0.9.3'
```

(If the previously added v0.9.7 is still registered, remove/replace it first so the profile does not keep loading the alpha-targeted build.)

## 4. Maintainer-side fixes so both defects cannot recur

**Release tooling (defect 1 — tag distribution):**
- Sync tags with every release, e.g. `git push --force-with-lease "$remote" HEAD:main --follow-tags` (or an explicit `git push "$remote" <tag-ref>` per released tag; avoid blanket `--tags --force`).
- Add a post-sync verification step that fails loud: for each mirror, check `git ls-remote --tags <remote>` contains every tag the release claims to publish (and that the commit hashes match). A missing tag should abort the release, not be discovered by a consumer.

**Version routing + docs (defect 2 — wrong-direction compatibility):**
- Encode the required DSH runtime in the plugin artifact (manifest/metadata) and validate it at plugin activation, so a mismatch fails loud at load with an actionable message ("requires dsh >= 0.1.2-alpha.1") instead of a browser `TypeError`.
- Fix the README default install command: it must pin the newest tag that targets the *oldest supported runtime line* (or provide per-runtime commands), never simply the newest tag.
- Keep the compat table exhaustive for every live tag, and record in it that v0.9.7+ requires the 0.1.2-alpha client; mention the intermediate-tag gap (v0.9.2–v0.9.6) or stop referencing tags that mirrors never received.
