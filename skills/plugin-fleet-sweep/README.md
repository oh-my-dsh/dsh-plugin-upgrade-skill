# plugin-fleet-sweep

Sweeping a whole installed DSH plugin fleet against an upgraded host:
static risky-API sweep per plugin, a driven-browser live sweep (CSS,
console, DOM markers, requests), per-plugin verdicts, and the per-plugin
fix/release loop. Born from the 2026-09-22 `dsh-v0.1.7-alpha.1` fleet sweep
(seven plugins; one break - the client primitives icon rename that crashed
the `dsh-ui-progress` input dock via React #130 - plus a re-applied
host-side hot-fix the upgrade had overwritten). Method-level on purpose;
the concrete evidence-capture toolchain lives in
`plugin-runtime-debug/references/browser-forensics.md` and the version
facts in `plugin-upgrade/references/`.

- `SKILL.md` - standing rules (verify on the target host; absence of errors
  is weak evidence; per-plugin releases), the sweep workflow, and the
  report format.
- `references/fleet-sweep-checklist.md` - the concrete per-plugin checklist:
  static patterns, live assertions, interaction-gated surfaces, and the
  release loop.
