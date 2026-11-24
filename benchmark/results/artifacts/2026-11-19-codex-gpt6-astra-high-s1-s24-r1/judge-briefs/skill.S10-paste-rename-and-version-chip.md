# JUDGE BRIEF · skill.S10-paste-rename-and-version-chip

## Criteria (sealed rubric)
- [paste-names-and-scope] (20pt) Design paste_image and paste_file names, adding (2), (3), etc. before the extension until an unused name is found. Reserve names within the batch as well as across live attachments. Scope renaming to clipboard acquisition before duplicate validation/record creation; drop and picker keep their real names. An explicit paste-only option in a shared function is equivalent if other sources remain unchanged. Do not require the words increment or collision. The prompt explicitly makes item 2 (original extension/MIME fallback and chip/upload display details) unscored: do not require or deduct for those details.
- [live-conflict-state] (20pt) Identify the live composer snapshot occurrences as the authoritative occupied-name source and explain why the records subscription can delete cache entries on a transient empty snapshot while an attachment remains live. Account for the current paste batch/in-flight reservations; records may supplement but cannot replace live state. Do not demand a particular variable name or literal source-of-truth phrase.
- [stale-tag-display] (20pt) Use the captured cached tags response (x-cache HIT, age, older 0.2.9) and renderCurrentChip(tag) to explain the stale latest label. Compare fetched and running PLUGIN_VERSION semantically: show an update only when remote is newer, otherwise show the running version, never an older fetched tag. Equivalent pseudocode such as remote > local and remote <= local is sufficient.
- [regressions] (20pt) Propose tests showing repeated/same-batch image pastes retain distinct live attachments, a live occurrence still blocks a name with an empty records cache, and drop/picker names stay unchanged. Test an older/equal remote tag against the running build and a genuinely newer remote tag. Concrete expected names or assertions in code suffice; no mandatory coexist/assert wording. Do not grade the unscored extension/display guidance.
- [release-hygiene] (20pt) Synchronize the package version and hand-inlined PLUGIN_VERSION in the distributed lib artifact, run its syntax check (node --check or equivalent) plus behavioral regressions, and explain deployment/update of the served plugin artifact followed by browser reload/hard refresh. A Git tag or update chip alone does not install the artifact; there is no host-side update endpoint. Package metadata wording is equivalent to package.json. Do not require executing or publishing this static fixture.

## Caps (score ceilings; judge returns each with triggered true/false)
(none)

## Candidate report(s)
#### FILE: S10-paste-rename-and-version-chip/report.md

# S10: paste naming and version-chip review

Read-only inspection under BENCHMARK-AUTH-v1. Read `skills/plugin-upgrade/SKILL.md` and its `references/pre-flight.md`; consulted the troubleshooting reference for relevant symptoms. Plan executed: inspect the five supplied evidence files, trace acquisition → validation → composer → dock/upload and tag fetch → comparison → rendering, then write this report. No fixture source, configuration, dependencies, or installation was changed. No migration, lifecycle script, fixture execution, external request, or publication was performed.

## Completed: evidence and identity

The evidence identifies the community package as `@org/dsh-attach-input`, running plugin release **0.2.10**, with GitHub tag source `org/dsh-attach-input`. Plugin versions are not DSH host versions. The supplied response establishes that tags v0.2.10 and v0.2.11 existed remotely when the API page still ended at v0.2.9. Installation track, full repository SHA, package manifest/lockfile, DSH/Node versions and compatibility cohort are not supplied; no host-version corridor can be inferred. These are client behavior fixes, not evidence of a host API migration.

## 1. Rename only clipboard files, before duplicate validation

Pass explicit acquisition provenance into the shared add flow, e.g. `add(sessionId, items, { source: 'paste' })`, with an unchanged-name default for existing callers. The paste handler supplies this option; drag/drop, file picker and folder picker do not. Do not infer paste from a name such as `image.png`: that can be a legitimate picked filename. Preserve picked folder-relative paths as well as basenames. Text-only paste remains unaffected.

Inside add, obtain `inputFor(sessionId)` and its current state snapshot, allocate clipboard names, then call `validateItems` on the resulting items. This must precede the current validation call: two `image.png` items in a single paste would otherwise fail the duplicate check before renaming can help. Allocate before creating records and inserting references so the item path, record label and occurrence label agree from the outset. Preserve the v0.2.10 coordinate handling.

Use these names, without spaces before parentheses:

- Images: `paste_image.png`, `paste_image(2).png`, `paste_image(3).png`, etc., with the actual chosen extension rather than forcing every image to PNG.
- Other files: `paste_file.pdf`, `paste_file(2).pdf`, etc., with their chosen extension.
- The first candidate has no `(1)`. Search ordinal 1, 2, 3… and take the smallest unused candidate. Compare full resulting paths, so `paste_image.jpg` does not consume `paste_image.png`. Fill a genuinely free gap rather than using the count of attachments or the maximum suffix blindly.

**The authoritative conflict source is the current composer's `input.state.getSnapshot().occurrences`, specifically existing attachment paths/labels in this session.** For this plugin, inspect occurrences with `o.source === SOURCE` and derive the path from the persisted attachment label/path (the excerpt exposes `occurrence.label`). Include other attachments if they share the same upload-path namespace. If a required path is unavailable, resolve it through the composer attachment data rather than treating a missing cache record as an unused name. A dropped/picked attachment already named `paste_image.png` must also reserve that name, even though it is never itself renamed.

Seed a temporary `used` set from those live occurrences. Add each allocated name to that set immediately, before processing the next item, so names are unique both across previous pastes and within the new batch. Serialize allocation/insertion per composer (or maintain equivalent scoped in-progress reservations) if calls can overlap across awaits; refresh the authoritative snapshot for each new transaction. Release failed insertions' temporary reservations, preserve successful earlier insertions, and follow the existing composer-change error path.

**Do not seed uniqueness only from the module-level `records` Map.** Its subscription calls `records.delete(ref)` whenever one snapshot has no matching occurrence and the record is not inflight. A transient empty snapshot can retire a record even though the occurrence is later visible again. Thus a restored `paste_image.png` can still occupy the composer while its record is absent. Cache-only allocation would reuse its name. `record?.label ?? occurrence.label` already acknowledges that dock occurrences can outlive records. Cache metadata can supplement, but must never erase, names established by the live composer. Separately harden record retirement so transient snapshots do not lose upload metadata; naming changes alone do not reconstruct deleted file data.

## 2. Extension and display contract

Prefer a usable extension from the original filename's final basename. Normalize a chosen extension consistently (for example lowercase); don't regard a leading dot alone or trailing dot as an extension. If absent, use a small explicit MIME-to-extension mapping, e.g. `image/png → png`, `image/jpeg → jpg`, `image/webp → webp`, `image/gif → gif`, `application/pdf → pdf`, `text/plain → txt`. Do not blindly append arbitrary MIME subtype text. For unknown MIME and no usable extension, keep the generated name extensionless (a documented `.bin` fallback is another possible policy; choose one consistently). This proposal uses extensionless names. MIME beginning `image/` selects `paste_image`; when MIME is empty, a recognized image extension can supply that classification. Preserve bytes, MIME type and timestamps; this is naming, not conversion.

Set the generated name on `item.path`, `record.label` and the inserted occurrence's label. The dock must display `paste_image(2).png` even when it falls back to `occurrence.label`. The upload mapping already reads `record.items[].path`, so it must send the same generated path, not the original `image.png`. A new File wrapper is optional if downstream code also requires `file.name`; changing only `file.name` or only the dock label is insufficient. Dropped/picked files retain their original path and display name.

## 3. Version-chip diagnosis and corrected rule

`tags-api-response.txt` captures `x-cache: HIT`, `age: 178`, and `cache-control: private, max-age=60, s-maxage=300`, with only v0.2.9 and older tags in the body. The page predates both pushes. HTTP 200 means a successful response, not fresh knowledge of all tags. A browser hard refresh cannot force an upstream cache to contain a newly pushed tag. The evidence supports a stale API/cache response, not an actual downgrade, incorrect running constant, or missing v0.2.11 tag.

`latestFromTags()` correctly selects the greatest stable tag *among the returned tags*. It cannot discover a tag omitted by a stale page. The second bug is `semverCmp(tag, PLUGIN_VERSION) <= 0` followed by `renderCurrentChip(tag)`: the non-update branch renders that older remote value as the installed/latest version.

Compare **the highest valid remote stable version** with **the running bundle's local `PLUGIN_VERSION`** using semantic comparison with an optional leading `v` normalized. If remote > local, show an update offer naming the remote target and, preferably, the running version. If remote <= local, any current-version chip must display the LOCAL version, e.g. `Current version v0.2.10`, never v0.2.9. If retaining the existing “already latest” copy, its version argument must still be local; more accurate copy is “Running v0.2.10; no newer version found in this check.” Remote < local specifically warrants “update information may be stale” rather than a confident global-latest assertion. Unknown/offline/error state should retain the known local version and state that the update check failed, not assert freshness.

Improve retrieval separately: request revalidation/no-store where supported and use a cache-busting query on explicit rechecks if necessary. Handle timeout, non-OK, invalid JSON and empty valid-tag lists without an unhandled rejection; do not poll indefinitely or imply cache bypass guarantees immediate visibility. A finite tags page is also limited evidence. The display invariant must remain correct even when every fetch mitigation fails. No network check was made in this review.

## 4. Regression test plan (proposed, not executed)

| Scenario | Required assertion |
|---|---|
| Three separate image pastes into one composer | Names are `paste_image.png`, `(2)`, `(3)`; prior occurrences reserve their names. |
| Multiple `image.png` files in one paste | Renaming happens before validateItems; no original-name duplicate rejection; all resulting paths distinct. |
| Same-name non-image pastes | `paste_file.pdf`, `paste_file(2).pdf`; other extensions use their own complete-path candidates. |
| Occupied base and `(3)`, free `(2)` | Allocator chooses `(2)`; it is not based on Map size or attachment count. |
| Pick/drop a real `image.png` or folder path | Path and name are unchanged; those callers never activate paste renaming. |
| Pick `paste_image.png`, then paste an image | Picked name remains; paste becomes `paste_image(2).png`. |
| Retire records on a transient empty snapshot, then restore occurrences | With records empty but composer containing `paste_image.png`, next paste is `(2)`; test would fail a Map-only allocator. Dock fallback still displays the generated label. |
| Concurrent pastes, session separation and rejected insertion | No duplicate paths within a composer, independent numbering across sessions, no permanent reservation for rejected references. |
| Extension/MIME and label/upload consistency | Original extension wins; extensionless image uses MIME; unknown stays extensionless; bytes/type unchanged; record and fallback labels equal the submitted path. |
| Local 0.2.10, captured stale remote maximum v0.2.9 | Never render “latest v0.2.9”; show local v0.2.10, with stale/uncertain wording; no downgrade offer. |
| Local 0.2.10, remote v0.2.10 | Current chip shows local v0.2.10, no update offer. |
| Local 0.2.10, remote v0.2.11 | Update chip targets v0.2.11 and identifies the current version correctly. |
| First stale response, then fresh v0.2.11 response | Explicit recheck transitions to update available; no persistent green result masks the new value. |
| Unsorted tags, 0.2.9 versus 0.2.10, leading `v`, prereleases | Numeric semver ordering, normalization and deliberate stable-only filtering; no lexical comparison. |
| Timeout, HTTP failure, malformed/empty tag result | Graceful unknown/offline state; local version remains true; no green “latest” claim or unhandled rejection. |
| Release artifact consistency | Package metadata, all inlined constants and served bundle identify the same release; artifact includes both fixes. |

## 5. Lib-only release hygiene and user delivery

There is no build step to regenerate lib output. Make the eventual approved source change in the shipped `lib/client.js` and any other actually shipped affected lib entry; do not stop at an unshipped source file. Search all shipped files for hand-inlined version strings, including `PLUGIN_VERSION`, and update them with package.json (and any manifest/lockfile version fields that exist). Use the next unoccupied plugin patch version; v0.2.11 already exists in the evidence, so do not overwrite that tag to ship an additional fix. Confirm exact release identity before selecting a new tag; this report cannot establish subsequent releases.

Run `node --check lib/client.js` and syntax checks for other changed shipped JS files under the package's actual module configuration. This detects broken hand-edited bundle syntax but is not a runtime test. Run the behavioral cases above against the shipped code, check package contents/packed manifest and filename, and mount the actual artifact in a real compatible DSH profile. Verify registration, paste/drop/picker behavior, uploaded names, and the running chip version after reload. Review any pack/install lifecycle scripts before running them. These are release steps, not commands executed here.

The chip is an update notification, not an installer: this plugin has **no host-side update endpoint**. Give users a release link and explicit manual upgrade instructions appropriate to their actual track (pinned package update for a registry install, checked-out tag/commit for Git, or replacement of the copied lib artifact). Preserve package identity and existing package-manager/lockfile ownership. Then reload the serving host where needed to invalidate boot-cached bundles and hard-refresh/reload the client, and verify the running constant. Merely pushing a Git tag or refreshing the browser does not update installed plugin files. Do not invent or call an update API, imply automatic installation, or upgrade DSH globally as part of this fix.

## Validation status, skipped work and rollback

Pre-existing baseline: not collected (Mode A, static excerpts). Completed: inspection of all five fixture files and the requested design/diagnosis/test/release report. No tests were run; the table is a prospective regression suite, not a claim of passing tests.

Skipped: host corridor cards, migration planner, dependency install/build, runtime mount and actual publishing. The evidence contains no host target, complete package or executable application; migration scripts would not establish these local client behavior fixes. Full Git/install identity and compatibility cannot be verified from this evidence pack. No blocker prevents this report; implementation and runtime validation remain future work.

Rollback: fixture and installed software are untouched, so no source/configuration rollback is needed. The only new artifact is this report under the authorized agent-output directory. For a later release, retain the prior shipped artifact and exact package/lockfile identity before editing; rollback only the plugin-owned changed files/package selection, then restart/reload and verify. No claim is made about recovering unrelated script effects.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.