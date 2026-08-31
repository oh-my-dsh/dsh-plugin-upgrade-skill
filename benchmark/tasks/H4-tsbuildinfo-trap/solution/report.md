# H4 Diagnostic Report (Reference Answer)

## Error Source

`MISSING_EXPORT resolveSessionPreset` appears at **build time** (rolldown/oxc reads the
build graph), while `tsc --noEmit` passes — the contradiction points to a build cache
false positive. Checking the fixture:

- `lib/index.js`: a stale artifact from the 0.1.1-rc.2 era that still
  `import { resolveSessionPreset }`;
- `lib/tsconfig.tsbuildinfo`: incremental build state whose referencedMap still pins
  `resolveSessionPreset` to the old dependency graph;
- `src/`: zero hits across the repository — the source has no reference to
  `resolveSessionPreset` at all.

Conclusion: the error comes from stale build artifacts and the incremental cache, not
from a real source dependency (the DSH-0.1.2-A1-21 deletion did happen, but this plugin
never called it).

## Should the Source Be Changed

**No changes needed.** The DSH-0.1.2-A1-21 migration recipe only applies to real callers;
applying it to code with zero references is pointless.

## Remediation Steps

1. `pnpm run clean` (removes `lib/` and the incremental cache);
2. Re-run `pnpm run build` — the build graph is rebuilt from the current source and the error disappears;
3. Verification discipline: from now on, run clean before every migration verification, then typecheck/build/test (incremental check results are not trustworthy; see migration-hygiene §1).
