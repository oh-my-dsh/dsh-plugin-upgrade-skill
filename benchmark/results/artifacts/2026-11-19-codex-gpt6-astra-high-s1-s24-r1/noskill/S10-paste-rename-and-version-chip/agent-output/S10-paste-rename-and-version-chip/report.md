# S10 report: paste names and version chip

This is a read-only analysis of the five supplied fixture files. No skill was used, no network calls or fixture code were executed, and no fixture files were changed. The changes and tests below are recommendations, not an implemented or verified patch. There is no blocker to this report; the excerpts do not permit an end-to-end implementation or release verification.

## 1. Paste-only renaming

Carry explicit acquisition provenance into the flow, for example `add(sessionId, items, { source: 'paste' })`, or perform the transformation in a dedicated paste adapter with access to the composer snapshot. Do not infer paste from the name `image.png`: a real picked or dropped file may have that name. File/folder picker and drag-and-drop paths must preserve their original names and relative folder paths, including files whose names happen to start with `paste_`.

For paste, allocate these paths:

- Images: `paste_image.<ext>`, `paste_image(2).<ext>`, `paste_image(3).<ext>`, and so on. PNG screenshots therefore produce exactly `paste_image.png`, `paste_image(2).png`, `paste_image(3).png`.
- Other files: `paste_file.<ext>`, `paste_file(2).<ext>`, and so on.
- With no usable extension, use `paste_image` or `paste_file` and the same suffix convention, without a trailing dot.

For each file in paste order, try the unsuffixed name first, then integers beginning at 2, selecting the smallest free candidate. Compare complete paths, so PNG and JPEG names can each start unsuffixed. Existing gaps can be reused after confirmed removal. Reserve each chosen name immediately in a working Set so a batch of identical clipboard names receives distinct names. Existing picked/dropped names also reserve conflicting paths even though they must not themselves be renamed.

The authoritative committed state is the current session composer's live attachment occurrences from `input.state.getSnapshot()`, including their canonical attachment path/name metadata and, in the supplied representation, `occurrence.label`. Seed the taken-name set from those occurrences, not merely `records.values()`. Read the snapshot immediately before allocation. Filter to the relevant attachment namespace; do not count unrelated text references. The full host schema is omitted, so the precise path metadata accessor must be confirmed during implementation; the excerpt explicitly supplies `occurrence.label` as the persistent fallback name.

The records Map is auxiliary state, not an authoritative inventory. Its subscription deletes a record on any snapshot lacking its occurrence while the record is not inflight. A transient empty snapshot can therefore retire a record even if the occurrence later returns and remains visible in the composer. Looking only in records would forget that occurrence's name and reuse it. Refreshing the records cache does not fix this lifecycle assumption. Use occurrence names even when the corresponding record is missing; do not require a successful record lookup to reserve a visible name. If the host marks a snapshot as transient/unready, defer allocation until committed state is available; the excerpts expose no such readiness API, so do not claim this part is already implemented.

Serialize concurrent paste allocations per session, or maintain per-session pending name reservations alongside live state. This closes the window before insertions are visible in snapshots. Re-read live state before a later allocation if an await or external insertion can intervene. Release reservations on failed insertion and retain names for successful inserts. Keep sessions independent.

Rename before `validateItems(items)` for paste: otherwise a batch of two original `image.png` paths fails the existing duplicate check before normalization can help. A suitable order is obtain live state, normalize and reserve pasted paths, validate normalized items, then create records and insert references. Continue normal validation for all other acquisition paths. Ensure validation failures unwind pending reservations. Do not rely on the existing in-batch duplicate check for cross-paste uniqueness.

## 2. Extension and visible/uploaded name

Use a valid final extension from the original file name first, with a consistent case normalization policy. If absent, infer a conventional extension from a known MIME mapping, such as image/png -> png, image/jpeg -> jpg, image/webp -> webp, application/pdf -> pdf, text/plain -> txt. Do not blindly use the MIME subtype: MIME strings can contain parameters or suffixes such as `+xml`. Strip parameters for lookup. Unknown MIME with no suffix yields the extensionless form above. An original extension wins over a conflicting MIME fallback. Classify image files by image MIME where available, with a narrow recognized-image-extension fallback for missing MIME; avoid treating arbitrary `application/octet-stream` files as images without supporting evidence.

The rename is attachment metadata, not a content conversion. Preserve the bytes, MIME type, size, and last-modified information. Update `item.path` and `record.label` consistently and pass the same label into the inserted occurrence. The dock expression `record?.label ?? occurrence.label` must show the generated name both with and without a cache record. The upload body already maps `record.items[*].path`, so that path must also be the generated name, not the clipboard name hidden behind a renamed chip. A File wrapper is needed only if another downstream API uses `File.name`; changing just that property would not change the supplied upload path. Dropped and picked display/upload paths remain original.

## 3. Why the version chip lied

There are two contributing causes, directly supported by the fixture:

1. The tag API supplied a stale cached page. `tags-api-response.txt` records `x-cache: HIT`, `age: 178`, and `cache-control: private, max-age=60, s-maxage=300`; the page only contains v0.2.9 and older. The captured remote tag listing contains v0.2.10 and v0.2.11. The observed cache age exceeds the roughly 90 seconds since the new push, consistent with a page predating it. A browser hard refresh does not invalidate an upstream cache. This is not evidence that v0.2.11 was missing or that the installed bundle was v0.2.9.
2. `startUpdateChip()` compares the fetched tag to local `PLUGIN_VERSION`, then passes the fetched tag to `renderCurrentChip()` for every remote <= local result. Thus remote v0.2.9 <= local 0.2.10 produces the false green version label.

Compare the highest valid fetched stable semantic version with the running bundle's local `PLUGIN_VERSION`, normalizing the optional `v` prefix and comparing numeric components. If remote > local, show an update available to the remote version, ideally also stating the current local version. If remote <= local, show the local version, never substitute the older fetched tag. For this incident the current label must show v0.2.10, not v0.2.9. Make `renderCurrentChip` derive its version from the local constant so callers cannot accidentally pass a remote tag.

Avoid an unconditional claim of global freshness from a cached response: for remote < local use wording such as `Running v0.2.10; update information may be stale`; for equality, `Running v0.2.10; no newer version found`. Fetch failure/empty valid tag list should preserve the local version and indicate the check could not complete, rather than imply latest. Only a fresh response containing v0.2.11 can support advertising that update.

A manual refresh, browser revalidation/no-cache request strategy, and bounded retry after suspected stale data can improve discovery. They cannot guarantee upstream cache invalidation. Review API rate limits and handle errors; do not promise immediate tag propagation. The ten-tag page is also a bounded observation, not proof of the globally newest release. These are separate robustness concerns from the demonstrated wrong-version rendering bug.

## 4. Proposed regression coverage

Attachment tests should exercise the paste entry point through observable composer labels and captured upload paths:

- One PNG paste produces `paste_image.png`; three separate identical PNG pastes produce base, (2), (3).
- Multiple identical original paths in one paste are renamed before validation and accepted with unique names.
- Repeated PDF pastes produce `paste_file.pdf`, then `paste_file(2).pdf`; mixed extensions use the documented full-path collision rule.
- Existing live occurrences occupying base and (2) force (3), even if records is empty. Explicitly simulate a transient empty subscription snapshot that deletes records, restore the live occurrence, then paste; it must not reuse its name.
- Existing base and (3) allocate (2); confirmed deletion allows reuse. Separate sessions do not consume each other's suffixes.
- Rapid concurrent paste operations never choose the same path; rejected insertions/validation release reservations, and partial success retains successful names.
- Drag/drop, file picker, and folder picker preserve original names and relative paths, including `image.png` and `paste_image.png`. A later paste avoids their occupied names.
- Original extension wins; absent extension uses known MIME; unknown MIME is extensionless. Bytes remain unchanged. Dock record and occurrence fallback labels agree with the uploaded path.

Version tests should mock the API and inspect visible chip text:

- Local 0.2.10, stale remote v0.2.9: current text shows v0.2.10 and does not call v0.2.9 the installed/latest version.
- Local 0.2.10, remote v0.2.10: no update, local version displayed.
- Local 0.2.10, remote v0.2.11: update available targeting v0.2.11; do not imply it is already installed.
- A stale response followed by a fresh response changes the UI from local/current-or-stale status to the update offer.
- Unsorted tags, optional prefix normalization, and numeric 0.2.9 vs 0.2.10 ordering are correct. Invalid/prerelease tags follow the intended stable-only policy.
- Timeout, non-OK response, malformed JSON, and empty stable list preserve current local version and show an unavailable check rather than false success.

These tests are specified, not run. No test harness or complete plugin bundle was supplied.

## 5. Lib-only release hygiene

There is no build step to regenerate shipped code. Edit the actual distributed `lib/client.js` for both behaviors; changing an unbundled source file alone does not deliver a fix. Before release, inventory hand-inlined version constants across the actual distributable and keep them synchronized with the chosen release's package.json version and tag, including `PLUGIN_VERSION`. Verify the packaged files contain the behavior and version changes. Do not assume a particular next version beyond the versions described in the fixture.

Run `node --check lib/client.js` on the actual release bundle, and syntax-check other changed distributed JavaScript in its proper module context. Run the proposed regression suite where a harness exists and smoke-test paste, drop, picker, dock, upload, and update-chip behavior in the host. Inspect package contents and release diff before publishing. The excerpt files are neither the complete bundle nor package metadata, so bundle syntax, package synchronization, and release contents have not been verified here.

The tag chip is a notification mechanism. This plugin has no host-side update endpoint, and a hard refresh does not install v0.2.11 over installed v0.2.10. Publish/distribute the updated lib-only package through the supported plugin installation channel and give users the supported manual update/reinstall instructions, followed by host reload if required. Link the chip to those instructions or the release. Do not invent an automatic update call or claim installation has succeeded from seeing a newer tag. After actual installation and reload, verify the running local constant shows the new version. Exact install commands and channel details are outside the supplied evidence.
