# Generic software migration workflow

Establish the requested scope, the installed and target versions, and the allowed changes. Distinguish an assessment from an implementation task. Respect existing authorization and repository instructions.

Inspect the repository, dependency declarations, configuration, installation source, and working tree. Preserve unrelated work and secrets. Record a reproducible baseline and existing failures before changing the target.

Read the available version history and primary documentation. Identify affected interfaces and dependencies, including intermediate changes and reversals. Separate supported evidence from assumptions. If necessary information is missing, explain the gap.

Map changes to the files that actually use the affected interfaces. Make a minimal plan, preserve unrelated configuration, and apply only authorized changes. Keep the repository's package manager and dependency state consistent. Avoid adopting optional features merely because a new version offers them.

Validate at several levels: dependency resolution, compilation, tests, activation in the actual environment, and an end-to-end behavior relevant to the task. A successful install or process start is only partial evidence. Compare failures with the baseline and distinguish regressions from existing problems.

Report the resulting versions, changes, evidence, limitations, skipped items, and recoverable paths. Do not claim a check ran when it did not. Keep conclusions proportional to the observations.
