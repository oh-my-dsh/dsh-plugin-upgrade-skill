# Contributing Guide

[简体中文](CONTRIBUTING.md) | **English**

We welcome contributions of version cards, verified evidence, examples, and validation tooling. Before you start, search existing issues/PRs so you don't duplicate a version or file that is already being claimed; if you find parallel work, coordinate first and do not overwrite other people's branches.

## Development workflow

1. Fork the repository and create a `feat/`, `fix/`, or `docs/` branch from the latest `main`;
2. Read the target directory's `SKILL.md` and `references/README.md`;
3. Only modify paths owned by the current PR; do not automatically stash/reset/clean user work;
4. Run the root validation and list the results truthfully in the PR;
5. One PR addresses exactly one logical topic.

## Adding a DSH version card

The single authoritative specification for cards is
[`skills/plugin-upgrade/references/README.md`](skills/plugin-upgrade/references/README.md).
Do not keep a second copy of the schema in this file.

### 1. Claim and confirm the version corridor

- Open an issue: `[Version tracking] DSH <from> → <to>`;
- Use exact official tags/commits, never `latest` or remembered guesses;
- Confirm that `references/README.md` does not already contain the same `from → to` edge;
- Read the full corridor first and fold net changes such as intermediate removals and target-version restorations.

### 2. Create the card-set file

Create `vX.Y.Z[-suffix].md` in `skills/plugin-upgrade/references/` and add, per the card schema:

- The `kind/schema/from/to/status/coverage/cardCount/idPrefix/verifiedAt` frontmatter;
- A complete, repository-unique ID such as `DSH-X.Y.Z-A1-01` (replace the version placeholder with the real coordinates when you land it);
- All the `Type/Applies to/Touchpoints/Action level/Symptoms/Migration recipe/Verification/Source` fields;
- A primary source pinned to a fixed tag/commit; when source code is available at the same tag, do not cite only the release notes.

Touchpoint numbering uses **#1–#7** from [pre-flight](skills/plugin-upgrade/references/pre-flight.md).
`curated` means a curated list — never describe it as a complete API diff. When a source has no concrete API coordinates, the recipe must require checking the target tag rather than inventing a call shape.

### 3. Update the index and cross-references

- Update the directed-corridor table and the exact card counts in `references/README.md`;
- Update the reference table in `plugin-upgrade/SKILL.md`;
- Cross-reference using full card IDs;
- If you changed a touchpoint pattern, sync `pre-flight.md`, `pre-flight-patterns.json`, and the static fixture.

### 4. Examples and verified evidence

- Runnable examples must declare the exact DSH tag, installation method, and the commands actually run;
- Fixtures used only for scanning must be clearly marked "static, do not execute";
- Distinguish Host, Web Client, and ordinary Cordis plugins; do not substitute APIs across different faces;
- Reports may claim only the scope actually verified; list the platforms, credentials, browsers, and product entry points that were not exercised;
- When local observations conflict with primary sources, record both side by side, reproduce, and report — do not silently overwrite.

## Source information priority

1. Official source code, types, tests, and architecture decisions at a fixed tag/commit;
2. Release notes and package documentation of the same tag;
3. Reproducible community migration records;
4. Personal experience (must include version, platform, and reproduction steps).

Never commit APIs guessed from memory, code snippets that do not state which face they apply to, or treat a successful install as runtime verification.

## Local validation

```sh
node scripts/validate.mjs
node scripts/validate-manifests.mjs
```

When you modify a skill, command, manifest, version card, or example, run both. If an example has its own build/test, run those commands too. Checks that were not run, or were limited by credentials/platform, must be noted in the PR.

`scripts/validate.mjs` also reconciles the root `README.md` / `README.en.md` — the headline
badges, the "What's in this repo" bullets, and every row of the coverage table — against the
`cardCount` in each card set's frontmatter and the real directory count under
`benchmark/tasks/`. If you change a card or task count, change the root README in the same PR.

The self-checks need the **full git history**: the execution-contract and evaluation-snapshot
validators resolve commits pinned in `task.toml` through local git objects. A shallow clone
(`git clone --depth 1`) fails them with `cannot resolve … skill snapshot tree` (for example on
H11 / H21). That is a clone artifact, not a repository defect — use a full clone, or run
`git fetch --unshallow` on an existing one, then `npm run prepare:ci` to fetch the snapshot
commits. CI already does this with `fetch-depth: 0`.

## PR checklist

- [ ] No duplication with existing issues/PRs, or coordination already completed
- [ ] Card schema, full IDs, seven touchpoints, and the index are consistent
- [ ] Recipes cite pinned primary sources and state the applicable face
- [ ] Examples/reports do not overstate validation conclusions
- [ ] Both repository validators pass
- [ ] PR description includes validation commands, uncovered boundaries, and acknowledgments

For card errors, open an issue with primary evidence; for new-version needs, create a version-tracking issue.
