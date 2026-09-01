# M2 fixture · optional-dep trap

A dsh 0.1.2-alpha.2 plugin whose `@deepseek-ai/dsh-util-time` dependency sits in
`optionalDependencies` while `lib/index.js` unconditionally imports it at top
level. The author comment claims optional is harmless and npm always installs it
— when the optional install is skipped, static install and typecheck stay green
and only the cold boot crashes. **Test material only — do not execute or
publish** (`"private": true`).
