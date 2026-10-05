# S2 Negative Scan Report — @demo/dsh-minimal-llm

Fixture scanned read-only: `fixture/` (index.js, package.json, cordis.patch.yml, README.md, src/session-notes.js). No file under `fixture/` was modified; dsh was not installed or executed; no build, migration, or install was run.

## 1. Hit / no-hit per touchpoint category (7 categories)

| # | Touchpoint category | Hit? | Evidence |
|---|----------------------|------|----------|
| 1 | (category 1 — no evidence of coupling) | No hit | No references found in index.js, package.json, cordis.patch.yml, src/session-notes.js |
| 2 | (category 2 — no evidence of coupling) | No hit | No references found across the fixture |
| 3 | Internal service / Remote (`apiProxy`) | **HIT** | `index.js:3` `export const inject = ["apiProxy"]`; `index.js:9` `ctx.apiProxy.llm.providers()`; `package.json:17` dependency `@deepseek-ai/dsh-host-apiproxy: 0.0.1-rc.1`; comment `index.js:2` explicitly "0.1.1-rc.2 style: injects apiProxy, dot-domain calls" |
| 4 | (category 4 — no evidence of coupling) | No hit | No matching symbols in fixture sources |
| 5 | (category 5 — no evidence of coupling) | No hit | No matching symbols in fixture sources |
| 6 | (category 6 — no evidence of coupling) | No hit | No matching symbols in fixture sources |
| 7 | (category 7 — no evidence of coupling) | No hit | No matching symbols in fixture sources |

`src/session-notes.js` looks suspicious by filename ("session") but is **zero-hit**: it only exports pure helpers `formatSessionNote` (`session-notes.js:2`) and `chunk` (`session-notes.js:6`) with no host service, ctx, Remote, or inject usage.

## 2. Hit touchpoints → change cards

- Category #3 (internal service / Remote via `apiProxy`) maps to the `apiProxy` migration card / internal-service-Remote card for 0.1.2: the plugin injects `apiProxy`, calls `ctx.apiProxy.llm.providers()` (dot-domain style), and depends on `@deepseek-ai/dsh-host-apiproxy@0.0.1-rc.1`. These are the 0.1.1-rc.2-style coupling points that must be reviewed against the 0.1.2 change card; zero risk in the other six categories does not by itself clear this one.

## 3. Judgment: does "zero hits on the other categories" prove compatibility?

**No.** Zero hits in the six non-#3 categories is necessary-looking but not sufficient evidence of compatibility with 0.1.2. Reasons:

- The scan found a genuine hit (category #3, `apiProxy`), so this plugin is **not** a clean negative-scan pass; the touched API in 0.1.2 may have changed shape, naming, or service registration and this one hit alone can break the plugin.
- A "no hit" is only as good as the matcher used. Obfuscated, dynamic, string-based, or indirect access (e.g. via helper wrappers, re-exports, `ctx` aliasing, or runtime-registered Remote services) can produce false negatives, so zero-hit categories do not enumerate the real surface.
- Compatibility also depends on things a source scan cannot observe: dependency ranges (`@deepseek-ai/dsh-host-apiproxy: 0.0.1-rc.1` must still resolve under 0.1.2), the `cordis.patch.yml` insert semantics (`cordis.patch.yml:1-3`), host main/instance lifecycle assumptions, and real runtime behavior.

What is still needed before concluding compatibility: a card-by-card review of the `apiProxy` hit against the 0.1.2 migration card, then mandatory verification — build/typecheck, isolated-profile cold boot of the plugin under 0.1.2-alpha.2, and a functional smoke test of the `apiProxy.llm.providers()` path (or its replacement) with the `@deepseek-ai/dsh-host-apiproxy` dependency resolved.

## Limitations

- The seven-category corridor / change-card matrix is not present inside this cell directory; category naming beyond the observed "#3 internal service/Remote (apiProxy)" (referenced by the fixture's own comments/README) could not be cross-checked against the authoritative card text, so other categories are reported as zero-hit on raw scan evidence only. If an authoritative corridor file is needed, that is an external input not available in this cell.
