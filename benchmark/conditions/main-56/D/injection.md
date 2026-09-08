# plugin-upgrade — experimental distilled procedure

## Material access boundary

All available material paths are under /experiment/materials. Historical references may link to scripts or examples that are not supplied. Do not retrieve or execute those specialized helpers; validate with the shared tools provided by the task instead.

This is an experimental adaptation of the archived plugin-upgrade skill. The complete source-matched references/ and facts.md are also available. Apply the following procedure only within the task's existing authorization, scope and shared execution policy.

## P01 · Choose the task mode

Classify the request as read-only inspection, an installed-plugin update, or author-source migration. Keep an inspection read-only; for changes, respect the user's existing authorization and the shared execution policy.

## P02 · Establish identities and ownership

Record source and installed identities separately, plugin version separately from host version, and the package name separately from the Git repository coordinate. Inspect package.json, lockfile, dsh-plugin.json if adopted, and profile composition; preserve unknown fields and unrelated changes.

## P03 · Check the running host

Before selecting the corridor, compare the running process with the on-disk checkout and use a generation-sensitive observation when available. If the target is the host running this agent, keep host replacement outside that session and report the required external procedure.

## P04 · Collect the baseline

For author migration, record build, typecheck and test results in the original dependency state before changing target pins. Record failures and recoverable paths, and compare later results against this baseline.

## P05 · Resolve the full corridor

Connect exact from/to edges using references/README.md, then read the entire applicable corridor and compute the target net state before editing. Mark missing edges as unsupported and use task-available exact-tag evidence to resolve gaps.

## P06 · Map touchpoints and faces

Use references/pre-flight.md to examine source patches, events, services/Remote, host filesystem, UI/commands/tools, custom channels, and subprocess/output. Record hit paths and the Host, Web Client, or ordinary-plugin face. Keep zero-hit conclusions provisional and still inspect dependencies and activation.

## P07 · Match evidence to a minimal plan

Select cards only where the corridor, face and touchpoints intersect. List hit files, required target behavior and validation. Keep optional capabilities as recommendations; mark unresolved API coordinates pending rather than guessing.

## P08 · Implement within the resolved installation track

Use the package manager represented by the lockfile and the resolved install track. Keep the DSH dependency cohort coherent across declarations and the full lockfile. Apply authorized minimal path edits and verify profile composition actually resolves the intended package without stale owned rows.

## P09 · Check exact API and type surfaces

When API, Remote, Settings, events, Headless, packaging or composition surfaces are hit, consult references/api-migration-0.1.2-alpha.2.md. For suspicious any inference, diagnose with skipLibCheck: false and inspect direct declaration ownership. Use references/precision-checklist.md for alpha.2 precision and preserve existing channel protocols when applying authentication.

## P10 · Validate real activation and behavior

Validate dependency and composition resolution, then build/typecheck/tests, a cold-started real profile, one core behavior, and wrapper exit/stdout/stderr/cancellation/teardown. For Web Client work, verify the advertised client artifact and registration/mount using the host boot manifest and the documented token-to-cookie flow; do not treat HTTP 200 alone as activation.

## P11 · Verify the release identity separately

After compatibility validation, apply any authorized plugin SemVer change separately from the host corridor and check both packed filename and packed manifest.

## P12 · Report evidence and remaining uncertainty

Report baseline failures, completed changes and checks, skipped non-hits with evidence, pending sources or runtime checks, rollback scope, and optional recommendations. Preserve conflicting observations alongside primary sources and investigate within the task budget; never silently substitute a preferred account.

