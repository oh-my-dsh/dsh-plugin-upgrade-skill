# Release-routing diagnosis

Mode A: read-only inspection. The plugin-upgrade SKILL.md was read, together with the rc.1→rc.2 reference and relevant alpha.1 client-migration material. BENCHMARK-AUTH-v1 authorizes this report. Plan: correlate the supplied release refs, sync script, compatibility table and runtime identity; give a frozen-runtime remedy and preventive release gates. No installation, migration, publication or fixture edit was performed.

## 1. Attempt 1: missing public tag

`fixture/ls-remote-tags.txt` lists the tags on `public-org/dsh-ui-progress`. It contains v0.9.1 and v0.9.7, but no v0.9.5. The README command asks pnpm to resolve that exact missing Git ref, so it cannot resolve the requested release. This is a release distribution defect, not evidence of a network problem or malformed consumer command.

The mechanism is visible in `fixture/sync-script.sh`: for origin, public and mirror2, the script pushes only `HEAD:main` using `--force-with-lease`. That explicit branch refspec does not publish the release tags. A successful branch sync therefore does not make a README's `#v0.9.5` installable. The second public mirror's actual tag state was not supplied; the script exposes the same omission for both mirrors, but only the named public mirror's missing refs are directly observed.

## 2. Attempt 2: newer plugin on older host

`fixture/dsh-version.txt` establishes the consumer's actual DSH runtime as **0.1.1-rc.2**. `fixture/compat-table.md` maps **plugin v0.9.7 → DSH 0.1.2-alpha.1**, with the alpha.1 views/legacy projection and `useConversation` seat. Conversely, **plugin v0.9.3 → DSH 0.1.1-rc.1**, with rc.1 real-boot verification and the table's explicit additive rc.2 relationship.

v0.9.7 is present in the mirror listing, explaining why resolution succeeds. Its subsequent browser error, `TypeError: useConversation is not a function`, is consistent with this alpha.1 client artifact being mounted on the older rc.2 host, which does not supply the expected callable seat. The direction is NEWER plugin API requirements on an OLDER DSH host; it is not an old plugin broken by a host upgrade. Installing package bytes does not establish browser API compatibility. Restarting the unchanged rc.2 host cannot add the alpha.1 API.

The local rc.1→rc.2 reference supports the additive image-related corridor; alpha.1 migration references describe the client projection/API boundary. The fixture compatibility table is the direct evidence for this plugin's release routing. No exact plugin source or browser runtime was supplied to independently execute the hook failure.

## 3. Remedy under the production freeze

Keep DSH at **0.1.1-rc.2** and route this consumer to **plugin v0.9.3**. Do not recommend v0.9.5 merely because its tag can be repaired: its compatibility is not documented in the evidence.

There is a prerequisite: **v0.9.3 is also missing from the supplied public tag listing**. The maintainer must first publish the authentic v0.9.3 release tag/artifact to the documented public mirror, verify its release commit and packaged version, and confirm that the tag resolves there. Then the concrete consumer command is:

```sh
dsh plugin --profile web add '@org/dsh-ui-progress@github:public-org/dsh-ui-progress#v0.9.3'
```

Preserve the package identity `@org/dsh-ui-progress`; it is independent of the GitHub owner `public-org`. Ensure the resulting web profile resolves this identity only to v0.9.3, replacing the v0.9.7 source rather than retaining duplicate composition rows. Cold-start the unchanged rc.2 host, reload the browser, and verify slot registration/mount plus the progress UI's core behavior.

This command is a remedy AFTER tag repair, not a claim that it works against today's supplied listing. No presently available compatible public tag, alternative mirror ref, registry artifact or immutable commit for v0.9.3 is proven by the evidence. If the maintainer cannot restore it immediately, a verified authentic v0.9.3 artifact/commit from a trusted source is required; there is insufficient evidence to invent an alternate command. A source backport would require separate implementation and rc.2 validation. Upgrading DSH is outside the consumer's constraint.

## 4. Maintainer prevention: publication and routing

1. Make release tag publication explicit for every advertised mirror. For a verified release tag, push an explicit refspec such as `git push public refs/tags/v0.9.3:refs/tags/v0.9.3`, and the equivalent to each other configured release remote. Repair missing historical advertised tags, including v0.9.5, only from verified release identities. Do not force-move existing release tags. An explicit allowlist avoids publishing unrelated private tags; branch pushes alone are insufficient, and `--follow-tags` alone can miss lightweight tags.
2. Gate publication on remote verification: check each exact release ref with `git ls-remote --tags`, dereference annotated tags, verify the expected commit and packaged manifest/version, and verify a clean install from each advertised mirror. If mirror-specific source rewriting changes commits, explicitly build and validate the intended mirror release artifact rather than tagging whatever HEAD happens to contain. Fail the release if any required mirror lacks its release ref. Publish README install commands only after this gate succeeds.
3. Make README defaults version-aware. Put the DSH compatibility table immediately beside installation commands: DSH 0.1.1-rc.1/rc.2 users pin plugin v0.9.3; DSH 0.1.2-alpha.1 users pin plugin v0.9.7. Show `dsh --version` before selection, explain the API boundary, and never replace every user's pin with the numerically latest plugin. Apply equivalent documentation to both mirrors and automated update notices.
4. Encode truthful host compatibility in release metadata supported by the target runtime/tooling, using prerelease-aware ranges; do not assert an untested broad host range. Verify that incompatible releases are refused or clearly routed away where enforcement exists. Metadata is additional protection, not proof that these older hosts enforce it.
5. CI should validate both resolution and runtime independently: check advertised tag presence and artifact identity on every mirror, then mount the supported release in real web profiles for rc.1/rc.2 and alpha.1 as appropriate. Exercise the slot/progress behavior and console errors. A successful pnpm install or typecheck alone cannot establish injected client-hook availability. Keep a tested legacy release channel for frozen hosts.

## Completion and limits

- **Pre-existing:** Mechanical baseline not collected; this is a static evidence pack, not a source migration checkout. The two reported failures are the inputs to diagnosis.
- **Completed:** All five fixture files inspected; distinct distribution and compatibility failures traced; frozen-runtime target and conditional exact command provided; release and documentation gates specified.
- **Skipped:** Builds, package scripts, installs, runtime startup, network ref checks and migrations are prohibited or unsupported by this static task. No source repository HEAD, lockfile, Node version, full dependency cohort or resolved composition is present; none is fabricated.
- **Pending/residual risk:** Actual tag repair, release commit/artifact verification, both-mirror resolution and an rc.2 browser smoke remain maintainer actions. v0.9.3 is rc.1 boot-verified in the evidence; rc.2 suitability follows the supplied compatibility note and still deserves direct mount verification. No independently verified usable v0.9.3 distribution source is supplied.
- **Rollback:** Fixture and consumer installation remain unchanged; only this report was written. Before a real replacement, preserve the consumer's profile composition and package/lockfile baseline so those specific files can be restored if necessary. No arbitrary lifecycle side-effect rollback is promised.
- **Blockers:** None to completing this read-only diagnosis. Missing public v0.9.3 availability blocks immediate execution of the proposed consumer install until the maintainer publishes or supplies a verified compatible artifact.
