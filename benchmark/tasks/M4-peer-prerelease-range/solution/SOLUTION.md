# M4-peer-prerelease-range reference solution

## Reference files

See [solution/plugin/](plugin/) — the fix rewrites both the peer and dev lower
bounds to `^0.1.2-alpha.2`; the cold boot
activates. Expected judge score 100.

## What it tests (one line)

rollup R-08 #3: a prerelease lower bound like `^0.1.0-rc.8` does not match
`0.1.2-alpha.2` under npm semver — the peer warnings vanish only when the bound
is rewritten to the target cohort.
