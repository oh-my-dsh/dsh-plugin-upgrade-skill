# JUDGE BRIEF · noskill.S1-static-scan

## Criteria (sealed rubric)
- [source-patch] (10pt) Locate the source patch declaration/target and script, distinguish source patching from ordinary composition, and explain the private session-view coupling.
- [events] (10pt) Locate the informational event producer/consumer and ignorable:true. Explain alpha.1 removal and alpha.2 restoration: preserve omission-safe informational markers, not a whitelist for required events. Do not claim arbitrary Session.append supports writing the marker.
- [host-services] (10pt) Locate apiProxy usage and its removal. Distinguish Host domain-service injection (llm/listProviders) from Web Client Remote; do not prescribe a nonexistent Host remote service.
- [host-path] (10pt) Locate the fixed homedir/.dsh/profiles/default path and explain using runtime DSH_HOME/profile information. Do not claim --profile was introduced in alpha.1.
- [ui] (10pt) Locate both the private SessionView import and command registration and explain public owner/seam verification after the split.
- [channel] (10pt) Locate the private loopback HTTP server. Explain that loopback does not bypass auth requirements and distinguish host-managed authenticated channels from raw routes.
- [subprocess] (10pt) Locate dsh subprocess calls and stdout JSON.parse. Explain stdout final text vs stderr progress, and that the JSONL assumption was already wrong, rather than inventing an alpha.2 stdout change.
- [mapping] (20pt) Map actual located couplings to A1-01, A1-02+A2-01, A1-03, A1-04, A1-08; A1-05 is a valid additional stdout mapping. A bare card list earns zero. Award half only when the mappings are substantively correct but incomplete.
- [limits] (10pt) Account for all seven hit categories (there are no no-hit categories here), state the scan limits, and propose target-version build/typecheck, isolated boot and a functional path. Never require actually executing this static fixture.

## Caps (score ceilings; judge returns each with triggered true/false)
(none)

## Candidate report(s)
#### FILE: S1-static-scan/report.md

# S1 · Static Touchpoint Scan — Read-Only Report

**Target plugin:** `legacy-plugin` (package.json `version: 0.1.1`) → migrating to **dsh 0.1.2-alpha.2**
**Corridor:** 0.1.1-rc.2 → 0.1.2-alpha.2
**Mode:** NOSKILL · static · read-only. The fixture was left completely unchanged.

## 0. Scope, method, and read-only discipline

**Scanned (complete tree, every file read in full):**

- `cordis.patch.yml` (6 lines)
- `package.json` (9 lines)
- `patch.yml` (6 lines)
- `README.md` (16 lines)
- `scripts/apply-patch.mjs` (19 lines)
- `src/index.ts` (68 lines)

That is the entire fixture (7 files; no hidden files; `scripts/` and `src/` are the only subdirectories). No file under `fixture/` was modified, created, or deleted. No migration or install command was executed. This report is the only file written (to `agent-output/S1-static-scan/`).

**NOSKILL note on card mapping:** the `skills/` directory (SKILL.md and canonical change-card IDs such as `DSH-0.1.x-xx`) is out of scope for this run and was not read or cited. Each hit below is therefore mapped to the corridor change identified by the fixture's own annotations — the code comments and the README hit-location table — plus the version markers (`alpha.1` / `alpha.2`) that appear in `src/index.ts`. I do **not** fabricate canonical card IDs.

## Summary

| # | Touchpoint category | Hit? | Files / lines |
|---|---|---|---|
| 1 | Source patch | **HIT** | `cordis.patch.yml:5-6` · `patch.yml:2-6` · `scripts/apply-patch.mjs:5-9` |
| 2 | Events | **HIT** | `src/index.ts:15-22` |
| 3 | Service / Remote | **HIT** | `src/index.ts:25-32` |
| 4 | Host directory | **HIT** | `src/index.ts:35-38` |
| 5 | UI / commands / tools | **HIT** | `src/index.ts:9-10`, `41-43` |
| 6 | Custom channel | **HIT** | `src/index.ts:45-54` |
| 7 | Subprocess / output parsing | **HIT** | `src/index.ts:57-66` · `scripts/apply-patch.mjs:11-18` |

All seven categories hit. There is no "no-hit" category in this fixture.

---

## 1. Source patch — HIT

**Files / lines**
- `cordis.patch.yml:5-6` — profile declares `patch:` → `- patch.yml`.
- `patch.yml:2-6` — patch surface schema: `surface:` → `target: src/session/view/SessionView.ts` → `replacements:` → `find:`/`replace:`.
- `scripts/apply-patch.mjs:5-9` — reads `patch.yml` directly (and `DSH_HARNESS_SOURCE_ROOT`), i.e. a hand-rolled apply path.

**Concrete coupling points**
1. The `patch` profile key in `cordis.patch.yml`.
2. The patch-surface schema (`surface[].target`, `replacements[].find`, `replacements[].replace`).
3. A bespoke apply script that consumes that schema itself.

**Card mapping (key point):** the source-patch declaration/surface mechanism is a known change surface in the 0.1.1-rc.2 → 0.1.2-alpha.2 corridor. The legacy plugin binds to the old patch-declaration shape (`patch` key + `surface` find/replace schema) and applies it via its own script rather than the new mechanism. Fixture annotation: `cordis.patch.yml` "profile composition plus source patch declaration (#1)"; `patch.yml` "static patch-surface fixture (#1)".

## 2. Events — HIT (with corridor folding)

**Files / lines**
- `src/index.ts:15-19` — `ctx.emit('session/event', { type: 'legacy/informational-note', ignorable: true, payload: {...} })`.
- `src/index.ts:20-22` — `ctx.on('session/event', ...)`.

**Concrete coupling points**
1. Emits an external **informational durable event** on the `session/event` channel.
2. Relies on the `ignorable` marker (`ignorable: true`).
3. Subscribes to `session/event` and reads `event.type`.

**Card mapping (key point + folding):** the SessionEvent change. Fixture annotation (lines 13-14): *"Producer of an external informational durable event. alpha.1 removed the ignorable marker; alpha.2 restored its producer/persistence contract."*

**Corridor folding reasoning (required):** the `ignorable` field is **removed in an intermediate corridor version (0.1.2-alpha.1) and restored in the target (0.1.2-alpha.2)**. Per the folding rule, this must be mapped by the **final net state**, not by the intermediate removal:
- Net state at target = **restored**. So the legacy `ignorable: true` is **not** a stale field to delete at the target — treating it as "removed" would be wrong, because alpha.2 restored the informational-event producer/persistence contract.
- The residual risk is the *shape of that restored contract*: because the field was removed and its producer/persistence contract was reworked across the corridor, the plugin's exact emission shape (`type` string, `ignorable`, `payload`) and its `session/event` subscription must be re-validated against the alpha.2 contract rather than assumed byte-for-byte unchanged. The **net** collision is "re-validated informational-event producer/persistence", not "delete `ignorable`".

## 3. Service / Remote — HIT

**Files / lines**
- `src/index.ts:25-28` — `rename-session` service: `ctx.get('apiProxy')` → `apiProxy.invoke('session.rename', ...)`.
- `src/index.ts:29-32` — `list-providers` service: `ctx.get('apiProxy')` → `apiProxy.invoke('llm.providers')`.

**Concrete coupling points**
1. `ctx.get('apiProxy')` — the legacy Host APIProxy handle.
2. `apiProxy.invoke('session.rename', ...)` and `apiProxy.invoke('llm.providers')` — remote method invocation through that proxy.

**Card mapping (key point):** the legacy Host APIProxy access is a known change in the corridor (internal service/Remote rework). The plugin must migrate from `ctx.get('apiProxy')` + `.invoke(...)` to the target service/Remote access pattern. Fixture annotation (line 24): "Legacy Host APIProxy calls."

## 4. Host directory — HIT

**Files / lines**
- `src/index.ts:35-38` — `write-note` service builds `join(homedir(), '.dsh', 'profiles', 'default')` and `writeFileSync(.../legacy-note.txt)`.

**Concrete coupling points**
1. Hard-coded host/profile path `~/.dsh/profiles/default` (`homedir()` + `.dsh/profiles/default`).
2. Direct `writeFileSync` into that fixed location.

**Card mapping (key point):** the host filesystem directory layout is a known change in the corridor — the fixed `~/.dsh/profiles/default` location is no longer a stable contract and must be resolved through the host-directory API rather than hard-coded. Fixture annotation (line 34): "Hard-coded Host/profile path."

## 5. UI / commands / tools — HIT

**Files / lines**
- `src/index.ts:9-10` — private import `import { SessionView } from '@deepseek-ai/dsh-session-view/internal'`.
- `src/index.ts:41-43` — `ctx.contributes.registerCommand('legacy.openView', () => new SessionView({ enhanced: true }))`.

**Concrete coupling points**
1. Deep import of the **private** Host/Web Client path `@deepseek-ai/dsh-session-view/internal`.
2. Command registration via `ctx.contributes.registerCommand(...)`.
3. Constructing `SessionView({ enhanced: true })` directly.

**Card mapping (key point):** the UI decomposition change removed the private Host/Web Client internal path, so the private `.../internal` import (and the direct `SessionView` construction / command registration) must migrate to the target UI/command/tool surface. Fixture annotation (line 9): "private Host/Web Client path removed by UI decomposition"; (line 40): "Private UI/command registration."

## 6. Custom channel — HIT

**Files / lines**
- `src/index.ts:45-54` — `startLegacyBridge()`: `createServer(...)` + `server.listen(43121, '127.0.0.1')` (loopback HTTP `http://localhost:43121/api/legacy`).

**Concrete coupling points**
1. A private loopback HTTP server (port 43121) as a custom channel.
2. Bypasses the Host Gateway authentication model (no gateway handshake/token).

**Card mapping (key point):** custom channels must go through the Host Gateway authentication model; the raw loopback bridge is a known change point in the corridor. Fixture annotation (line 45): "Private loopback HTTP bridge that bypasses the Host Gateway authentication model."

## 7. Subprocess / output parsing — HIT

**Files / lines**
- `src/index.ts:57-66` — `headless-ask` service: `spawn('dsh', ['--profile', 'headless', prompt])`, parses each stdout line via `JSON.parse`, expects `event.type === 'final'`.
- `scripts/apply-patch.mjs:11-18` — `execFileSync('dsh', ['--profile', 'headless', 'ping'])`, splits stdout into lines, `JSON.parse(line)`, expects `event.type === 'final'`.

**Concrete coupling points**
1. Spawning the `dsh` CLI in headless mode and consuming its stdout.
2. The **wrong assumption that headless stdout is JSONL** (parse-each-line-as-JSON, look for `event.type === 'final'`).

**Card mapping (key point):** the headless CLI output contract changed — target headless stdout is **final text, not JSONL**. Both call sites must stop parsing stdout as newline-delimited JSON events. Fixture annotation (line 56): "Deliberately wrong wrapper assumption: treats headless stdout as JSONL"; `apply-patch.mjs:11` same.

---

## 8. No-hit categories and the "no hit ≠ no problem" caveat

There is **no** touchpoint category with zero hits in this fixture — all seven hit (see summary table). For completeness, here is what was scanned and ruled out, and why a clean scan can never be read as "no hit = no problem":

- **Coverage:** every file under `fixture/` was enumerated and read in full (7 files, `scripts/` + `src/`). No file was skipped, and no category was left unsearched.
- **Per-category ruling out:** for each category I searched the whole tree for its distinctive markers (`patch`/`surface` for #1; `emit`/`on(` + `session/event` for #2; `ctx.get('apiProxy')`/`invoke` for #3; `homedir`/`.dsh`/`profiles` for #4; `/internal`/`registerCommand`/`SessionView` for #5; `createServer`/`listen`/port for #6; `spawn`/`execFileSync`/`JSON.parse` of stdout for #7). Every category returned a hit, so no category is "ruled out".
- **Why "no hit" cannot be concluded as "no problem" (even though it does not apply here):** a static scan sees only the literal source in this copy. It cannot see (a) runtime-resolved targets (`ctx.get('apiProxy')` is a string lookup resolved at runtime; the actual service name could be aliased elsewhere), (b) transitive/indirect coupling (code that reaches a changed API through a helper, a re-export, or a dependency not vendored in the fixture), (c) configuration-driven behavior (values read from env or external files at runtime), and (d) semantic coupling that only manifests when the plugin is actually loaded against the target runtime. So absence of a literal token is evidence, not proof, of non-collision.

## 9. Read-only discipline statement

- Only paths under `fixture/` were read; only `agent-output/S1-static-scan/` was written.
- No `fixture/` file was modified, added, or deleted (verified: tree unchanged after the scan).
- No migration, install, or execution of the plugin or `apply-patch.mjs` was performed (the fixture is static-only and non-compiling by design).


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.