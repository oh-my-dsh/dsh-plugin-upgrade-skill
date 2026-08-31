# H3 Reference Solution

## Reference Changes

See [solution/plugin/](plugin/); expected judge score: 100.

1. `package.json`: move the top-level `client` field into
   `"dsh": { "client": { "platform": "web", "inject": ["remote"] } }` — the alpha host
   only scans `dsh.client` (and requires a `./client` bundle in exports); the top-level
   `client` is a 0.1.1 legacy convention that alpha silently ignores, so the
   "don't touch package.json" comment is wrong;
2. `client.js`: per DSH-0.1.2-A2-02, change the direct await into a `RemoteResult`
   result branch (`result.ok` check) — this step does not affect the judge score (the
   browser half never executes inside the container), but it is the correct migration
   for this corridor.

## The Point (in one sentence)

The client plane contract (validation report, section 4): a browser plugin goes through
`ctx.remote.*` and only enters the browser plugin roster if `dsh.client` is declared in
package.json; when the declaration is missing, the **symptom is silent** — it installs
and the host half activates, but `__DSH_BOOT__.entries` never contains it.

## Grading Boundary (important)

There is no browser inside the container, so the judge does not execute client.js at
runtime; "real recognition in the browser roster" is judged as: after a web cold boot,
exchange the bootstrap token for a Cookie, GET `/`, and check that the host's announced
boot graph (`__DSH_BOOT__`) contains the `@demo/dsh-bench-paste/client.js` entry. This
matches the acceptance requirements of DSH-0.1.2-A1-19 (neither a single 200 nor a URL
in the logs alone proves the plugin works; conversely, an absent entry proves it was not
recognized). The `RemoteResult` error flow and real browser calls are not covered, and
the scoring notes declare this boundary.
