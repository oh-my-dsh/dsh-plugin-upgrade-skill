# S1 · Static Touchpoint Inspection Report — `legacy-plugin` (dsh 0.1.1 → 0.1.2-alpha.2 corridor)

- **Date:** 2026-09-15
- **Object scanned:** `/app/fixture/` (read-only static copy of the legacy plugin source; 6 files, 124 lines total)
- **Mode:** static copy inspection only. Nothing was executed, installed, or migrated; no file under `/app/fixture/` was created, modified, or deleted.
- **Report location:** `/app/agent-output/S1-static-scan/touchpoint-scan-report.md`

---

## 0. Method, coverage, and read-only attestation

**Files scanned (complete enumeration — every file under the fixture root was read in full):**

| File | Lines | SHA-256 (state as scanned) |
|---|---|---|
| `fixture/README.md` | 16 | `84b8fd89…e79800` |
| `fixture/cordis.patch.yml` | 6 | `a9feaa3e…f16dd9668` |
| `fixture/package.json` | 9 | `af1e498c…f920446e` |
| `fixture/patch.yml` | 6 | `de622598…595b3b` |
| `fixture/scripts/apply-patch.mjs` | 19 | `4d6744ba…e091221f0` |
| `fixture/src/index.ts` | 68 | `42997927…c086d0` |

A directory sweep (`find . -mindepth 1 -type f -o -type l -o -type p -o -type s`) confirmed there are no symlinks, hidden files, or additional file types; the six files above are the entire evidence pack.

**Commands used:** read-only `find`, `grep -rn`, `shasum -a 256`, `wc -l`, plus file reads. No build, install, migration, network, or execution of fixture code. The fixture cannot run by design (its own README states it is "not an installable plugin … do not execute or publish it"), so all findings below are static, verifiable by line number.

**Headline result: 7 of 7 touchpoint categories hit.** There is no zero-hit category in this plugin; requirement 3 is therefore answered in §9 (coverage proof + why "no hit" would not have implied "no problem" anyway).

---

## 1. Category-by-category findings

Legend: **Hit** = the legacy coupling pattern is statically present. "Coupling points" name the exact API/surface the plugin is welded to.

### #1 Source patch — **HIT**

| File | Lines | Coupling point |
|---|---|---|
| `cordis.patch.yml` | 5–6 | `patch:` key in the plugin/profile manifest composing a source-patch list referencing `patch.yml` |
| `patch.yml` | 2–6 | `surface:` declaration targeting a **Host source file** `src/session/view/SessionView.ts`, with literal `find:`/`replace:` strings on the exact export `export function renderSessionView` |
| `scripts/apply-patch.mjs` | 5–9 | Reads `patch.yml` and applies the surface against an external host checkout located via the `DSH_HARNESS_SOURCE_ROOT` env var — i.e., the patch mechanism mutates the Host tree, not plugin-local files |
| `package.json` | 7 | npm script `"apply-patch": "node scripts/apply-patch.mjs"` wiring the patch step into the plugin lifecycle |

Cross-coupling (important): the patch's `find:` anchor (`patch.yml:3,5`) targets `src/session/view/SessionView.ts` / `renderSessionView` — the very Host internals that touchpoint **#5**'s UI-decomposition change relocates/renames. Even if the patch *schema* still loads, the anchor string will no longer match the target-version Host source, so the patch silently no-ops or hard-fails. Touchpoints #1 and #5 collide through the same underlying change.

### #2 Internal/persistent events — **HIT statically, but NET-NEUTRAL after corridor folding** (see §2)

| File | Lines | Coupling point |
|---|---|---|
| `src/index.ts` | 13–19 | Producer: `ctx.emit('session/event', { type: 'legacy/informational-note', ignorable: true, payload: { text: 'fixture' } })` — an external informational durable `SessionEvent` with the `ignorable` marker |
| `src/index.ts` | 20–22 | Consumer: `ctx.on('session/event', …)` with `SessionEvent` typing (type reference survives only as a comment here: `(event: any /* SessionEvent */)`; the real type import is not present in this static copy) |

The event name `session/event` is the only event topic used anywhere in the plugin (verified by grep — no other `emit`/`on` topics exist), and `ignorable: true` (line 17) is the only field whose shape the corridor touches.

### #3 Internal service / Remote — **HIT**

| File | Lines | Coupling point |
|---|---|---|
| `src/index.ts` | 25–28 | `ctx.register('rename-session', …)` → `await ctx.get('apiProxy')` → `apiProxy.invoke('session.rename', { id, title })` |
| `src/index.ts` | 29–32 | `ctx.register('list-providers', …)` → `await ctx.get('apiProxy')` → `apiProxy.invoke('llm.providers')` |

Coupling points, enumerated: (a) the Host-internal service id `'apiProxy'` obtained through the container service locator `ctx.get()`; (b) two internal RPC verb names `'session.rename'` and `'llm.providers'`. This is twice-redundant coupling — the locator key and the verb names must both survive the corridor. `ctx.get('apiProxy')` is the exact string the fixture README cites as the hit marker.

### #4 Host filesystem / host directory — **HIT**

| File | Lines | Coupling point |
|---|---|---|
| `src/index.ts` | 35–38 | `ctx.register('write-note', …)` → `join(homedir(), '.dsh', 'profiles', 'default')` → `writeFileSync(join(profileDir, 'legacy-note.txt'), text)` |

Coupling points: (a) the hard-coded Host profile directory layout `~/.dsh/profiles/default` (built from `homedir()`); (b) direct, unmediated `writeFileSync` into a Host-managed directory — no Host storage API, no existence check on the directory. Any corridor change to the profile-directory layout (rename, versioning, move under a per-profile/per-version path) breaks the write, and the code would then create a stray `~/.dsh/profiles/default` tree or throw `ENOENT`.

### #5 Internal UI / commands / tools — **HIT** (two distinct coupling points)

| File | Lines | Coupling point |
|---|---|---|
| `src/index.ts` | 10 | `import { SessionView } from '@deepseek-ai/dsh-session-view/internal'` — a **private** `/internal` subpath export of the Host/Web Client package (the source's own comment: "private Host/Web Client path removed by UI decomposition") |
| `src/index.ts` | 41–43 | `ctx.contributes.registerCommand('legacy.openView', …)` returning `new SessionView({ enhanced: true })` — imperative internal command registration on `ctx.contributes`, plus instantiation of the removed internal view class |

Both coupling points sit on the same corridor change (UI decomposition): the `/internal` entry point disappears, so the import at line 10 fails to resolve and the command body at line 42 cannot construct the view; the imperative `registerCommand` channel on `ctx.contributes` is also the legacy internal registration path the corridor replaces. Note also `SessionView` is the only thing imported from the package — nothing else in the plugin touches Host UI.

### #6 Custom channel — **HIT** (statically present as dead code)

| File | Lines | Coupling point |
|---|---|---|
| `src/index.ts` | 45–54 | `startLegacyBridge()`: `createServer(…)` → `response.end('legacy')` → `server.listen(43121, '127.0.0.1')` — a private loopback HTTP listener (comment at line 51: `// http://localhost:43121/api/legacy`) that bypasses the Host Gateway authentication model (per the source comment at line 45) |

Nuance to report honestly: `startLegacyBridge` is **never invoked** — line 54 is `void startLegacyBridge`, so today the listener is dead code and there is no runtime exposure. Statically, however, the full bypass pattern is present in the source, which is what a static scan must flag: any future edit that calls the function (or a bundler/tree-shake change that keeps it reachable) activates an unauthenticated channel. Corridor-wise this is a coupling that must be *removed or re-registered through the Host Gateway*, not merely left dormant.

### #7 Subprocess / output parsing — **HIT** (two sites, both built on the same wrong assumption)

| File | Lines | Coupling point |
|---|---|---|
| `src/index.ts` | 57–67 | `ctx.register('headless-ask', …)` → `spawn('dsh', ['--profile', 'headless', prompt])` → treats each stdout chunk as a JSONL line: `JSON.parse(line.toString())`, expects `{ type: 'final', text }` events (lines 62–63). Source comment line 56: "Deliberately wrong wrapper assumption: treats headless stdout as JSONL" |
| `scripts/apply-patch.mjs` | 11–19 | `execFileSync('dsh', ['--profile', 'headless', 'ping'])` → `output.split('\n')` → `JSON.parse(line)` → `event.type === 'final'`. Source comment line 11: "Deliberately wrong expectation: target headless stdout is final text, not JSONL" |

The corridor change: in the target version, `dsh --profile headless <prompt>` writes the **final answer text directly** to stdout — not a JSONL event stream. Consequences at both sites: `JSON.parse` receives a plain-text line, throws `SyntaxError` (in `apply-patch.mjs` the throw propagates out of `execFileSync`'s consumer loop and kills the script; in `index.ts` the throw lands on the `stdout` 'data' handler and the promise never resolves/rejects — a hang plus a lost result). Compounding effect: because `apply-patch.mjs` is also the **#1 patch applier**, the #7 breakage takes the #1 patch pipeline down with it.

---

## 2. Corridor folding — how touchpoint #2 must be mapped

The instruction requires folding: *"when a field is removed in an intermediate corridor version and restored in the target version, treat it by the final net state."*

The fixture itself encodes the corridor history for the event contract (`src/index.ts:14`): *"alpha.1 removed the ignorable marker; alpha.2 restored its producer/persistence contract."* So the corridor is:

```
0.1.1-rc.2 ──► 0.1.2-alpha.1 ──► 0.1.2-alpha.2 (target)
   ignorable: true   REMOVED            RESTORED (producer/persistence contract back)
```

**Correct mapping by final net state:** in the *target* version the `ignorable` marker and the informational-event producer/persistence contract exist again, i.e. the net state of the event contract at 0.1.2-alpha.2 is **equivalent to what the plugin was written against**. Therefore:

- The hit at `src/index.ts:13–22` must **not** be reported as a migration collision, and must **not** be charged to the intermediate (alpha.1) removal card as if the plugin needed rework.
- The governing card for this touchpoint is the **alpha.2 restoration card** (producer/persistence contract restored): against it, the verdict is *no action required — keep `ctx.emit('session/event', { …, ignorable: true, … })` as is*.
- The alpha.1 removal card is recorded as **superseded/folded away** by the alpha.2 card; it explains why a naive per-version diff would produce a false positive, but it does not survive to the net diff. If a maintainer diffed only rc.2 → alpha.1 they would rewrite the emitter for nothing (and possibly diverge from the restored contract); the corridor-folded view avoids exactly that.

This is the one place in the corridor where a per-step mapping and a net mapping disagree, and the net mapping is the one that is correct for migration planning.

---

## 3. Mapping to change cards in the 0.1.1-rc.2 → 0.1.2-alpha.2 corridor

**Honesty note on card IDs:** the corridor's card catalog (the document that assigns IDs such as `A1-01`) is not part of this container's evidence pack — `/app/fixture/` contains only the plugin source, and no card reference exists anywhere else inside the container. The exact ID *numbers* below are therefore reconstructed and must be treated as provisional. What is authoritative is the **card content**, which is pinned by the corridor evidence in the source itself (inline comments in `src/index.ts:9,14,24,34,45,56` and `scripts/apply-patch.mjs:11`) and by the fixture README's hit table. Each row gives the full card description so the maintainer can match it to the catalog one-to-one; if any reconstructed ID disagrees with the catalog, the content governs.

Card-ID convention used below: `A1-xx` = a change landed in the intermediate step 0.1.2-**a**lpha.**1**; `A2-xx` = landed in the target step 0.1.2-**a**lpha.**2**. This grouping is directly evidenced for the #2 pair by `src/index.ts:14`; for the remaining cards the group cannot be determined from inside the container and is left as `A?-xx`.

| Touchpoint | Corridor card (content — authoritative) | Reconstructed ID | Group evidence | Net verdict for the plugin |
|---|---|---|---|---|
| #1 | **Source-patch surface / manifest change** — the `patch:` composition key in the plugin manifest and the `surface:`/`target`/`replacements` (`find`/`replace`) patch format are reworked; patching Host sources becomes restricted or re-declared | `A?-0x` | not determinable in-container | **Collision — rework required.** Re-declare/replace the patch under the new mechanism; drop the Host-tree mutation via `DSH_HARNESS_SOURCE_ROOT` if the corridor retires it |
| #1 (cross) | **Host source layout change (UI decomposition)** — `src/session/view/SessionView.ts` and its `renderSessionView` export move/rename (same change as #5) | same card as #5 | same change family | **Collision via anchor rot** — the `find:` string in `patch.yml:5` no longer matches the target Host source even where the patch format itself still works |
| #2 (intermediate) | **`ignorable` marker removed from informational session events** | `A1-xx` | evidenced by `src/index.ts:14` ("alpha.1 removed…") | **Folded away — superseded by the alpha.2 card below; no action** |
| #2 (target) | **Producer/persistence contract for informational session events restored** | `A2-xx` | evidenced by `src/index.ts:14` ("…alpha.2 restored") | **Net-neutral.** Governing card by final net state; emitter/consumer at `src/index.ts:13–22` stay as written |
| #3 | **Internal service exposure change** — Host-internal `apiProxy` is no longer reachable via the plugin service locator `ctx.get()` (locator key removed/renamed; internal RPC verbs `session.rename`, `llm.providers` not part of the plugin-facing surface) | `A?-0x` | not determinable in-container | **Collision — rework required.** Both locator key and verb names break; migrate to the plugin-facing Host API that replaces `apiProxy.invoke` |
| #4 | **Host profile-directory layout change** — the fixed `~/.dsh/profiles/default` path is no longer a stable contract; direct filesystem writes into Host-managed directories are unsupported in favor of Host-provided storage | `A?-0x` | not determinable in-container | **Collision — rework required.** Replace `join(homedir(), '.dsh','profiles','default')` + `writeFileSync` (`src/index.ts:36–37`) with the corridor's storage/profile-dir API |
| #5 | **UI decomposition / private export removal** — the private Host/Web Client path `@deepseek-ai/dsh-session-view/internal` is removed; `SessionView` is no longer importable, and the imperative `ctx.contributes.registerCommand` internal registration path is replaced | `A?-0x` | not determinable in-container (source comment: "removed by UI decomposition") | **Collision — rework required.** Drop the import (`src/index.ts:10`), re-implement or re-point `legacy.openView` (`src/index.ts:41–43`) through the public contribution surface |
| #6 | **Custom channel / Host Gateway authentication model** — private loopback HTTP listeners that bypass Host Gateway auth are no longer permitted; channels must register through the Host Gateway | `A?-0x` | not determinable in-container | **Collision present in source (dead code today).** Remove `startLegacyBridge` (`src/index.ts:47–54`) or re-register port 43121 `/api/legacy` through the Gateway |
| #7 | **Headless output format change** — `dsh --profile headless <prompt>` stdout in the target is the **final answer text**, not a JSONL event stream (`{type:'final', text}` frames gone) | `A?-0x` | target-state evidenced by `scripts/apply-patch.mjs:11` and `src/index.ts:56` | **Collision — rework required at both sites.** Parse stdout as final text (`src/index.ts:59–64`, `scripts/apply-patch.mjs:12–19`); note this unblocks the #1 patch pipeline, which currently dies inside the same broken parsing |

Summary of net mapping: **5 categories require migration rework (#1, #3, #4, #5, #6, #7 — six counting #1's and #7's multi-site hits), 1 category is corridor-folded to net-neutral (#2), and within the hits there are 2 compounding effects (#1×#5 anchor rot; #7×#1 pipeline failure).**

---

## 4. Requirement 3 — zero-hit analysis and the limits of a static scan

**Were there zero-hit categories?** No. All seven categories produced at least one static hit (§1). For completeness, the negative results *within* each category — i.e., what was scanned and ruled out beyond the hits:

- **#1:** the only patch declarations are `cordis.patch.yml` + `patch.yml`; no other manifest key, no additional surface entries, no other patch scripts (grep over `patch|surface|replacements` across all 6 files).
- **#2:** the only event topic in the source is `session/event`; no other `emit`/`on` usage exists. The "external informational SessionEvent producer" named in the fixture README is *this same emitter* — no additional producer file exists inside the fixture (its `SessionEvent` type import was stripped to a comment).
- **#3:** the only locator key used is `'apiProxy'`; the only RPC verbs are `'session.rename'` and `'llm.providers'`; the other three `ctx.register` calls (`write-note`, `list-providers` wrapper, `headless-ask`, `rename-session`) are plugin-provided commands, not Host-service lookups.
- **#4:** the only Host path referenced is `~/.dsh/profiles/default`; no other `node:fs` write site exists.
- **#5:** the only Host-UI import is the `/internal` one; the only command registered through `ctx.contributes` is `legacy.openView`.
- **#6:** the only listener is port `43121` on `127.0.0.1`; no other `createServer`/`listen` exists in the fixture.
- **#7:** the only subprocess invocations are the two `dsh --profile headless` calls; no other stdout parsing exists.

**Why "no hit = no problem" cannot be concluded (illustrated by this very fixture):**

1. **Dead code hides live couplings, and present code may be inert.** Touchpoint #6 is a full Gateway-bypass listener that is *never invoked* — statically a hit, dynamically currently harmless. The converse holds too: a category could show no runtime exposure today and still carry a one-line-away collision. Static presence/absence is not a verdict on impact.
2. **The evidence pack is incomplete by construction.** The patch target (`src/session/view/SessionView.ts`) is a *Host* file not shipped in the fixture; the `SessionEvent` type, the `dsh` binary, and `DSH_HARNESS_SOURCE_ROOT` all live outside the pack. A clean scan here can never clear couplings whose other half is outside the scanned tree.
3. **Static analysis cannot see dynamic construction.** Event names, service keys, or paths assembled from variables, config, or env at runtime would not match any grep — the absence of a literal is not the absence of a coupling.
4. **The fixture is non-compilable by design**, so type-level breakage (e.g., removed exports, changed signatures behind `ctx: any`) cannot be confirmed or refuted here — several couplings are only provable at install/build time against the real target-version packages.
5. **Behavioral couplings are invisible:** authentication topology (#6), stream framing (#7), and persistence contracts (#2) are runtime properties; a static pass classifies them only by pattern, and only against the corridor's documented net state.

Hence even a hypothetically all-green scan would support at most "no *known* corridor collision found in this copy", never "the plugin is migration-safe".

---

## 5. Discipline and limitations statement

- **Read-only discipline:** `/app/fixture/` was accessed exclusively through read operations (file reads, `find`, `grep`, `shasum`, `wc`). The SHA-256 table in §0 records the exact bytes as scanned; no file was added to, removed from, or modified under the fixture, and no fixture code was executed. All writes were confined to this report under `/app/agent-output/S1-static-scan/`.
- **No migrations or installations were run**, per the task brief.
- **Limitation — card ID numbers:** the corridor card catalog is not present inside the container, so the `A1-xx`/`A2-xx` numbers in §3 are reconstructed, not copied. The alpha.1/alpha.2 grouping for touchpoint #2 is evidenced by the source itself; all other groupings and numbers are provisional and the card *contents* in §3 are the authoritative match keys.
- **Limitation — static only:** per the brief, this is a static copy inspection; runtime verification, compilation, and any actual migration are out of scope and were not attempted.
