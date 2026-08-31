# M4 fixture · legacy peer lower bound

A dsh plugin declaring `@deepseek-ai/dsh-agent: ^0.1.0-rc.8` in peer and dev
dependencies. Under npm semver's prerelease rule this range does **not** match
`0.1.2-alpha.2`, so installing into an alpha.2 profile emits "Issues with peer
dependencies" warnings regardless of actual host compatibility (rollup R-08 #3).
The README claim "the range guarantees host compatibility" is wrong. **Test
material only — do not execute or publish** (`"private": true`).
