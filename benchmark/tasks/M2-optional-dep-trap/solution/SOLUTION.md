# M2-optional-dep-trap reference solution

## Reference files

See [solution/plugin/](plugin/) — the fix moves `@deepseek-ai/dsh-util-time` out of
`optionalDependencies` into `dependencies` with the published `^0.1.2-alpha.2`
range, keeping the top-level import intact. Expected judge score 100.

## What it tests (one line)

DSH-0.1.2-A2-03 field note #2: a top-level import of a package declared optional
passes install and typecheck and only crashes at cold boot — fix the dependency
contract, don't wrap the import.
