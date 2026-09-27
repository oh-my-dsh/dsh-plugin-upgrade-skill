# S10 — Paste renaming and version-chip follow-ups

## Scope and evidence

Mode A: read-only inspection under the plugin-upgrade skill. No migration, installation, fixture execution, dependency changes, publication, or host upgrade was performed. The only output is this report.

The complete task instruction and skill were read, followed by every file in the static evidence pack. All fixture paths below are relative to E:/deepseek-harness/dsh-plugin-upgrade-skill/benchmark/tasks/S10-paste-rename-and-version-chip/environment/fixture:

- README.md: this is a static excerpt pack, not an executable repository.
- plugin-attachment-flow.js: shared acquisition flow, duplicate validation, record lifetime, dock label, upload path.
- plugin-version-chip.js: running version, tags fetch, comparison, current-version rendering.
- tags-api-response.txt: cached HTTP response and evidence that the newer tags exist remotely.
- user-threads.md: both user requirements and observed behavior.

Source identity is @org/dsh-attach-input v0.2.10; the tag request names org/dsh-attach-input on GitHub independently of the registry package identity. The evidence says v0.2.11 was pushed. It does not establish npm publication, installation mechanism, package compatibility range, exact source HEAD, lockfile, DSH/Node versions, or the full shipped artifact. Those were not inferred from the running harness. No host-version corridor is specified, so migration cards and mechanical migration baselines are inapplicable. A supplementary local read-only search for paste_image/paste_file in checkout JavaScript returned no hits; that limited negative result does not establish the absence of any native convention.

## 1. Follow-up A: paste-only renaming

### Scheme and placement

For each pasted image, use paste_image.<ext>, then paste_image(2).<ext>, paste_image(3).<ext>, and so on. Other pasted files use paste_file.<ext> with the same suffix rule. The first candidate is unnumbered, then numbering starts at 2. Choose the smallest free candidate for the exact base/extension combination; do not use records.size or a global monotonically increasing counter. Separate sessions have separate occupied-name sets. Removing an attachment permits reuse of its name if nothing else occupies it.

The acquisition source must be explicit. Prefer a paste-specific preparation step before the paste caller invokes add(); alternatively pass a source discriminator and perform preparation only for source === 'paste'. Drop, file picker, and folder picker must preserve original names and relative paths exactly. All three paths currently funnel into add() (plugin-attachment-flow.js:3), so an unconditional rename in add() would break the user's requirement.

Perform paste renaming before validateItems(). That validator rejects duplicate item.path values inside the current batch (lines 5–15); two clipboard screenshots both named image.png must first receive different final names. Keep size and other validation intact. A renamed item.path must flow through record.items, record.label, and the composer occurrence's display label, rather than changing just a dock string. The exact insertion argument fields are omitted from the excerpt and must be checked in full source rather than guessed.

### Authoritative occupied names

Use the current target session's composer state: inputFor(sessionId).state.getSnapshot().occurrences, specifically the labels representing attachment names (or an explicitly documented canonical path field if the complete API exposes it). Include relevant composer attachments even when their records Map entries are absent. Do not limit occupancy to the incoming batch or only to records that happen to remain cached.

Construct a set of occupied names from that snapshot and add every name allocated earlier in the same batch immediately. For each incoming pasted item, try the unnumbered candidate, then (2), (3), etc., reserving the selected name before considering the next item. This handles both repeated paste events and duplicates within one clipboard batch, including a pre-existing attachment literally named paste_image.png.

The records Map is upload/dock bookkeeping, not authoritative composer occupancy. Lines 30–39 subscribe to snapshots and delete a record whenever its occurrence is momentarily absent and it is not inflight. Once unsubscribed and deleted, a later snapshot can contain the occurrence without restoring the record. Using records alone therefore lets a later paste reuse an occupied name. The dock already acknowledges this separation: line 44 falls back to occurrence.label when record is absent. Using live occurrence labels avoids this cache-loss failure.

Drops and picker additions also pass through add(), so they can have records; the defect is not that all drops necessarily bypass the Map. The decisive case is a composer occurrence that survives or reappears after its record was retired. Current-batch reservations are still needed because not-yet-inserted names cannot be in the snapshot.

For overlapping paste operations, serialize name allocation plus insertion per composer, or use short-lived pending reservations that are released after successful insertion/failure. Refresh the snapshot before allocation and respect insertReference rejection: do not report an attachment as accepted if the composer changed. If the composer itself is in a transient empty/unavailable state, defer allocation until usable state or revalidate before insertion; reading a transient snapshot does not magically recover hidden occurrences. These concurrency details need confirmation against the complete composer API. Do not replace the live occupancy source with a long-lived cache to solve them.

### Extension and display

Determine image versus non-image primarily from MIME type (image/* versus other types). Prefer a usable original filename extension; the ordinary clipboard name image.png still has a valid png extension. Use MIME-to-extension fallback only when the original name lacks a usable extension: for example image/png → png, image/jpeg → jpg, image/webp → webp, application/pdf → pdf. Preserve the original extension unless a deliberate, tested normalization policy says otherwise. For unknown MIME without an extension, choose a documented extensionless fallback rather than inventing a format. Renaming does not transcode bytes.

The dock chip must display the canonical renamed path through record.label and occurrence.label fallback. The uploaded files[].path must be the same renamed item.path (lines 24–25 and 44–45). Merely replacing record.label leaves uploads named image.png and does not satisfy the request. The browser File.name need not be mutated if item.path is the canonical upload/display name. Drop/picker labels and uploaded paths remain unchanged, including folder-relative paths.

## 2. Follow-up B: stale tags plus the wrong displayed value

The capture was taken about 90 seconds after v0.2.11 was pushed. It records HTTP 200, x-cache: HIT, age: 178, and cache-control with max-age=60 and s-maxage=300. The response contains v0.2.9 and older tags but neither v0.2.10 nor v0.2.11. The supplied git ls-remote output establishes that both newer tags existed remotely. This is evidence of a stale cached tags response, not evidence that the user downgraded or that the v0.2.11 tag was missing. A browser hard refresh does not guarantee that an upstream cache is refreshed.

latestFromTags() correctly selects the highest stable tag it can see in that response: v0.2.9. In plugin-version-chip.js:21, semverCmp(tag, PLUGIN_VERSION) <= 0 routes to renderCurrentChip(tag). Lines 25–27 then interpolate the fetched tag in the green already-latest label, although the bundle's running constant is 0.2.10 (line 5). Thus caching explains why the update was temporarily invisible, while the rendering bug explains the affirmative false label v0.2.9.

### Correct comparison and display rule

Normalize the optional leading v and compare the fetched stable version numerically as SemVer against the locally known PLUGIN_VERSION. Do not compare lexicographically: 0.2.10 is newer than 0.2.9.

- Remote > running: display an update offer naming the remote target, e.g. “v0.2.11 available; running v0.2.10”. It is an offer, not proof of installation.
- Remote = running: the current/up-to-date chip displays the local running version.
- Remote < running: never display the older remote tag as the installed/latest version or suggest a downgrade. The minimum fix for the existing <= branch is renderCurrentChip(PLUGIN_VERSION), with consistent v formatting. More accurate wording is “Running v0.2.10; no newer version found in this check” or an inconclusive/stale-check state, rather than claiming global freshness.
- Missing tags, invalid response, network error, or timeout: an unavailable-check state; optionally show the known running version, but make no freshness claim.

The fetched value decides whether to advertise an update; the local constant supplies the version displayed as running/current. Cache bypass/revalidation may reduce delay but cannot substitute for this invariant or guarantee immediate upstream freshness. Keep any retries bounded and avoid polling aggressively. The code fetches only ten tags and filters stable releases, so its result is the newest visible stable candidate, not a guaranteed complete release catalog.

## 3. Regression tests

### Paste naming and acquisition isolation

1. Paste three image.png files in one batch: no duplicate-validation error; final paths and labels are paste_image.png, paste_image(2).png, paste_image(3).png.
2. Paste across separate events: existing occurrence names are respected and numbering continues. Include gaps such as unnumbered and (3) occupied: next is (2).
3. Paste multiple non-image files and a mixed image/PDF batch: paste_file.pdf, paste_file(2).pdf; image and PDF candidates are independently allocated by exact final name.
4. Seed a composer occurrence labelled paste_image.png while records is empty: next paste is paste_image(2).png. Also simulate the subscription seeing an empty snapshot, retiring a record, then restoring the occurrence before the next paste. The existing name remains occupied. This directly catches the fragile-cache implementation.
5. Seed a drop/picker attachment with the literal target name: pasting avoids it; no pre-existing attachment is renamed.
6. Drag/drop and file/folder picker preserve actual names and nested paths, even when their MIME types are images. Exercise callers rather than only a renaming helper.
7. Check record.label, occurrence.label fallback after record loss, record.items[].path, and serialized upload files[].path all agree. Confirm bytes/MIME are unchanged.
8. Check original-extension priority, MIME fallback, unknown MIME/no extension, different sessions, actual removal/reuse, concurrent paste calls, and rejected insertion cleanup. Define the expected composer-stability behavior before implementing the race tests.

### Version chip

9. Exact reproduction: running 0.2.10, mock response tags [v0.2.9, v0.2.8, v0.2.7]. The current chip must show v0.2.10 or an explicitly inconclusive state, never “already latest v0.2.9”, and never offer a downgrade.
10. Equal version shows local v0.2.10; a response containing v0.2.11 offers that target while keeping the running version 0.2.10. A later fresh response after the stale one changes to an update offer.
11. Test numeric ordering and optional v prefixes, unordered tag arrays, prerelease filtering under the stable-only policy, empty/invalid payloads, timeout, rejection, and non-200 responses. Failures must not become a green freshness assertion.
12. Artifact guard: package.json version equals every hand-inlined plugin-version constant in the shipped lib artifact. Test the rendered installed-version text against that constant, not a remote tag.

These are proposed regression tests; none were executed against the static excerpts.

## 4. Lib-only release hygiene and delivery

- Update package.json and every hand-inlined PLUGIN_VERSION/display version in shipped lib files together. There is no build step to regenerate them. This is the plugin's own SemVer, not a DSH host-version bump. The complete package and all constants are absent from the fixture, so their synchronization is a release check, not a verified fact.
- Edit the actual distributed lib/client.js, not only hypothetical source that never builds. Run node --check lib/client.js and equivalent checks for other edited JS entry files. Syntax checks are necessary but do not prove browser execution, imports, registration, or behavior; run focused tests and a real Web mount/paste smoke against the packaged artifact before release.
- Inspect the packed file list, package manifest version, archive filename, and shipped bundle constant. Verify the new artifact actually contains the fixes before publishing/tagging. These are recommendations only; no pack, scripts, publication, or network checks were run here.
- There is no host-side update endpoint. The chip must not claim to install the update or call an invented endpoint. Users must update the installed plugin through its actual documented distribution mechanism, preserving its package identity and installation track. For a registry install, use the confirmed published exact plugin version; a Git tag alone is not proof that that registry version exists. For Git/copied installs, follow their documented update mechanism instead.
- After updating the installed artifact, reload/restart the host/client as that plugin's distribution requires and refresh the browser to load the new bundle. A hard refresh without installing a new artifact does not upgrade an installed v0.2.10 plugin. Verify the running constant and mounted behavior after reload. Do not infer success from the tags response or install exit code alone.
- Explain the potential cache delay after a release. A truthful chip and explicit manual-update guidance are required; a cache-busting request is only optional latency mitigation.

## 5. Skill close-out

**Pre-existing:** not collected; no executable repository baseline is provided and Mode A does not run migration scripts. The two defects are demonstrated by supplied code/evidence, not by a locally executed test suite.

**Completed:** all task evidence read; paste-only naming design, authoritative composer conflict source, extension/display guidance, cached-tag diagnosis, comparison/display rule, regression plan, and lib-only release hygiene documented. Only this report was written.

**Skipped:** no from/to DSH corridor, dependency resolution changes, profile composition changes, installs, release operations, or mechanical/runtime migration verification. Version-card reads were unnecessary for this local feature/regression diagnosis. The static fixture lacks a full package, Git baseline, lockfile, composition, and runnable test harness.

**Pending/residual risk:** exact occurrence metadata and insertion signatures, composer transient/concurrent behavior, all shipped inline constants, actual install/publication track, and real Web registration require the full plugin. The retiring subscription may independently lose upload records; naming from occurrences prevents collisions but does not repair upload bookkeeping. A retirement fix must use a documented settled/committed state signal or equivalent verified lifecycle rule, not assume a single timeout is sufficient. No blocker prevents this read-only report; implementation and runtime verification remain unperformed.

**Rollback:** no plugin/configuration files changed, so no migration rollback is needed. No install scripts ran and there are no claimed third-party side effects. Before a future implementation, record the actual source HEAD, artifact/version, lockfile and owned configuration paths; restore only those owned paths if validation fails.

**Recommendations:** implement paste-only canonical path allocation from composer occurrences plus current-batch reservations; fix the <= chip branch to display PLUGIN_VERSION; make stale responses non-authoritative; land the above regression checks and artifact version/syntax gates before the next release.
