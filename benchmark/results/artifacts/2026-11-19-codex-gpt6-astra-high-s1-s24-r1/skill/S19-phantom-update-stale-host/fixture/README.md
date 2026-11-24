# Evidence pack — exam material only, do not publish

All files in this directory are READ-ONLY evidence from a real 2026-09-05 release
session of the client plugin `@dsh-external/dsh-file-trace` (v0.3.7/v0.3.8). The
agent must not modify anything here; the report goes to
`/app/agent-output/S19-phantom-update-stale-host/`.

| File | What it is |
|---|---|
| `release-log.md` | the maintainer's actual operation order for the v0.3.7 release (commit, build, version bump, tag, mirror pushes) |
| `package.json` | the manifest as committed for v0.3.8 (version 0.3.8) |
| `git-tags.txt` | `git ls-remote` tag listings for the three push mirrors |
| `client-bundle-excerpt.js` | the shipped client bundle's self-update check, verbatim (version constant included) |
| `asset-route-probe.txt` | HTTP probes of the host asset route for a PNG and an SVG, after the client was confirmed refreshed |
| `lib-index-excerpt.js` | the shipped host half's asset-route content-type whitelist, verbatim |
| `session-log-excerpt.txt` | a decoded session-log excerpt: the read result text for the SVG, the source file's own lines, and an XML well-formedness verdict |
