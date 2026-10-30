# Appendix · raw read-only scanner outputs (S1-static-scan)

Captured 2026-10-20. Both scripts are documented read-only (plan-migration.mjs "never writes the target repository and has no output-file option"; inject-lint.mjs read-only residue/peer check). No file under fixture/ was modified.

## A. plan-migration.mjs (heuristic first pass)

Command:
node skills/plugin-upgrade/scripts/plan-migration.mjs --root <fixture> --from dsh-v0.1.1-rc.2 --to dsh-v0.1.2-alpha.2

Exit 0. Corridor resolved: v0.1.2-alpha.1.md (curated) + v0.1.2-alpha.2.md (curated). Scanned files: 5 (Markdown skipped by design).

Touchpoints: all seven "detected" — #1 3/3, #2 1/1, #3 1/1, #4 2/2, #5 1/1, #6 1/1, #7 2/2.

Hit locations (path:line, pattern no.):
- #1 scripts/apply-patch.mjs:8 (p1); cordis.patch.yml:6 (p1); patch.yml:1 (p2)
- #2 src/index.ts:15 (p1)
- #3 src/index.ts:24 (p1)   [comment line matching "APIProxy"; real code at :26-27, :30-31]
- #4 src/index.ts:36 (p1); scripts/apply-patch.mjs:2 (p2)
- #5 src/index.ts:41 (p1)
- #6 src/index.ts:48 (p1)
- #7 src/index.ts:8 (p1); scripts/apply-patch.mjs:3 (p1)

Applicable cards (planner selection = every card whose Touchpoints numbers intersect any detected class; OVER-INCLUSIVE, refined per-card in the main report):
A1-01, A1-02, A1-03, A1-04, A1-05, A1-06, A1-07, A1-08, A1-09, A1-10, A1-11, A1-13, A1-14, A1-19, A1-20, A1-21, A1-22, A1-25, A1-26, A1-27, A1-28, A1-29, A1-30, A1-31, A1-32, A2-01, A2-02, A2-04, A2-05, A2-06, A2-08, A2-10 (all DSH-0.1.2- prefix).

Manual-review cards (no numeric touchpoints): A1-12, A1-23, A1-24, A2-03.

## B. inject-lint.mjs (alpha.2 residue/peer check)

Command: node skills/plugin-upgrade/scripts/inject-lint.mjs <fixture>

Exit 0. Report:
{
  "importedClientModules": [],
  "declaredInject": [],
  "peersMissingForInject": [],
  "peersMissingForImports": [],
  "cordisPeer": null,
  "cordisOk": false,
  "runtimeRefsLeft": [],
  "rawWebServerRouteFiles": [],
  "routeReviewRequired": false,
  "verdict": "FIX-REQUIRED"
}

Reading: verdict FIX-REQUIRED is driven by cordisPeer=null / cordisOk=false — the fixture's package.json declares no dependencies at all, so the Cordis peer floor required by the alpha.2 precision checklist is absent. runtimeRefsLeft=[] confirms no removed dsh-client-runtime references. rawWebServerRouteFiles=[] means the linter's ctx.webServer.register() route probe does not see the fixture's raw node:http createServer bridge — the #6 auth review in the main report is therefore manual, not tool-covered.

## C. Fixture file hashes (SHA-256, first 16 hex) — post-scan state

A9FEAA3EC0F63CED  cordis.patch.yml
AF1E498CA6F80B65  package.json
DE622598FC298F54  patch.yml
84B8FD89D9E05ABC  README.md
4D6744BAF58FE055  scripts/apply-patch.mjs
429979274FE9776E  src/index.ts

Only read-only operations were used against fixture/ (read/glob/grep tools plus the two documented read-only scripts). No write, edit, install, migration, or git operation touched it.
