# S1 · Static Touchpoint Scan — legacy-plugin (read-only inspection report)

**Scope**: read-only scan of the fixture source of `legacy-plugin` (dsh 0.1.1 era), pre-migration inspection for the `dsh-v0.1.1-rc.2 → dsh-v0.1.2-alpha.2` corridor. No file under the fixture was modified, created, or deleted; no migrations or installations were executed; no network access was used.

**Corridor built from the skill's version index**: `dsh-v0.1.1-rc.2 → dsh-v0.1.2-alpha.1` (cards `DSH-0.1.2-A1-01..32`) then `dsh-v0.1.2-alpha.1 → dsh-v0.1.2-alpha.2` (cards `DSH-0.1.2-A2-01..08`). Net state = full corridor folded, per pre-flight step 1 ("read the full corridor first and fold net changes such as 'removed then restored'").

**Files scanned** (complete fixture inventory, all files read in full): `README.md`, `package.json`, `cordis.patch.yml`, `patch.yml`, `scripts/apply-patch.mjs`, `src/index.ts`.

---

## Per-touchpoint findings

### #1 Source patch / monkey patch — HIT

- **Hit files/lines**:
  - `patch.yml:1-6` — declares a source-patch `surface` targeting host file `src/session/view/SessionView.ts`, replacing `export function renderSessionView` with `renderSessionViewPatched`. This is a true host-source patch surface, not profile composition.
  - `scripts/apply-patch.mjs:5-9` — reads `patch.yml` and applies it via `DSH_HARNESS_SOURCE_ROOT` (source-tree patching harness).
  - `cordis.patch.yml:5-6` — `patch: [patch.yml]` wires the patch surface into profile composition.
- **Coupling points**: the patch target path `src/session/view/SessionView.ts` and the symbol `renderSessionView` are host-internal coupling; the patch applicator depends on the source-root env contract.
- **Near-miss clarification (not a #1 hit by itself)**: `cordis.patch.yml` is Cordis *profile composition*, not a source patch (cf. API-08, "cordis.patch.yml is composition, not a source patch"; pre-flight: "a filename containing `patch` alone is not a hit for this class"). It hits #1 here only because it mounts the actual `patch.yml` surface.
- **Card mapping**: **DSH-0.1.2-A1-03** ("Session view internals split up extensively" — Touchpoints #1, #5; breaking). Symptom matches exactly: "Patch target paths ... no longer work". Recipe requires checking each patch-surface path against an exact-tag compare and marking no-equivalent targets "pending confirmation" — `src/session/view/SessionView.ts` must be re-validated against the alpha.2 tag, not guessed.

### #2 Internal event names / persistent events — HIT

- **Hit files/lines**: `src/index.ts:13-22` —
  - line 15-19: `ctx.emit('session/event', { type: 'legacy/informational-note', ignorable: true, payload: { text: 'fixture' } })` — producer of a third-party *persisted informational* event carrying the `ignorable: true` marker;
  - line 20-22: `ctx.on('session/event', ...)` — observer of the same channel.
- **Coupling points**: the persisted event type `legacy/informational-note` (unknown to first-party readers) and the `ignorable` envelope field.
- **Card mapping — corridor folding applied**: the field was removed in an intermediate version and restored in the target:
  - `DSH-0.1.2-A1-02` ("SessionEvent.ignorable temporarily removed", breaking, action level *required-if-target-is-alpha.1*);
  - `DSH-0.1.2-A2-01` ("Restore SessionEvent.ignorable for third-party persisted events", fix, required-if-hit).
  - **Net state for a 0.1.2-alpha.2 target: the `ignorable` retention semantics are restored, so the producer is NOT a forced removal.** The correct mapping is **A2-01 as the governing card, with A1-02 recorded as the folded intermediate (removed-then-restored, not double-breaking)**. A1-02's own recipe states this: "If the final target is alpha.2 or later, first read DSH-0.1.2-A2-01 to compute the corridor net state; do not delete the producer marker and then restore it."
  - Residual A2-01 conditions that still apply to this hit: the marker is only for informational events an old reader can omit (`legacy/informational-note` qualifies as written); alpha.2's live `Session.append()` still has no `ignorable` parameter (this fixture uses `ctx.emit`, static-only); and unknown events *without* the marker remain required-on-read.

### #3 Internal service / Remote — HIT

- **Hit files/lines**: `src/index.ts:24-32` —
  - line 26 + 27: `const apiProxy = await ctx.get('apiProxy')` then `apiProxy.invoke('session.rename', { id, title })`;
  - line 30 + 31: `ctx.get('apiProxy')` then `apiProxy.invoke('llm.providers')`.
- **Coupling points**: the rc.2 service key `apiProxy` (package `@deepseek-ai/dsh-host-apiproxy`, deleted in the corridor) and the dotted wire operations `session.rename` and `llm.providers`.
- **Card mapping**: **DSH-0.1.2-A1-01** ("APIProxy removed, Host/Web Client calls moved to @Remote", breaking, Touchpoint #3). Per its table: `session.rename` → `session/rename`; `llm.providers` → `llm/listProviders` **+** `llm/listConfigurableProviders` (one call split into two). Field note of the card: since this is a host-plane plugin, the migration is to inject the owning domain service directly (skip the gateway), not `inject: ['remote']`.
- **Second-order card**: **DSH-0.1.2-A2-02** ("Remote failures become RemoteError instances; error codes gain namespaces", breaking, Touchpoint #3) — after migrating the two calls to any Remote surface, error handling must branch on namespaced `RemoteError` codes via `RemoteResult.ok`, never on old bare code strings.

### #4 Host directory read/write — HIT

- **Hit files/lines**: `src/index.ts:34-38` — `const profileDir = join(homedir(), '.dsh', 'profiles', 'default')` then `writeFileSync(join(profileDir, 'legacy-note.txt'), text)` inside the `write-note` command.
- **Coupling points**: the hard-coded Host profile directory `~/.dsh/profiles/default` (assumed default profile name and fixed home layout).
- **Card mapping**: **DSH-0.1.2-A1-04** ("ACP/SDK examples merged into the dsh profile ... removed", Touchpoints #4, #7). Its recipe: "Use the runtime `DSH_HOME`, the target profile, and the official launcher as the source of truth ... do not hardcode user directories." The profile set itself grew in alpha.1 (`acp`, `sdk`, `sdk-minimal` added), so "the default profile directory" is no longer a safe fixed assumption.

### #5 Internal UI / commands / tool registration — HIT (two distinct couplings)

- **Hit files/lines**:
  - `src/index.ts:10` — `import { SessionView } from '@deepseek-ai/dsh-session-view/internal'` (comment line 9 flags it: "private Host/Web Client path removed by UI decomposition");
  - `src/index.ts:41-43` — `ctx.contributes.registerCommand('legacy.openView', () => new SessionView({ enhanced: true }))`.
- **Coupling points**: the `/internal` export path of the session-view package and the internal component used as a command handler's return value.
- **Card mapping**: **DSH-0.1.2-A1-03** (Touchpoints #1, #5) — "internal imports, or UI registration points no longer work"; recipe: rebuild imports by owning module, and mark anything without a stable public seam "pending confirmation" (no guessing of new paths). No stable public seam for a directly constructed `SessionView` is documented in this corridor → mark that facet **pending confirmation**.

### #6 Custom HTTP / WS / RPC channel — HIT

- **Hit files/lines**: `src/index.ts:45-54` — `startLegacyBridge()` creates a raw `node:http` server on `server.listen(43121, '127.0.0.1')` (comment: "http://localhost:43121/api/legacy"), described at line 45 as a "Private loopback HTTP bridge that bypasses the Host Gateway authentication model". Note: the function is never invoked (line 54 `void startLegacyBridge`), so the coupling is latent in source but present statically.
- **Coupling points**: a custom loopback HTTP route outside the Host Gateway's auth gate, with a `/api/legacy` path naming convention that mimics official `/api` routes.
- **Card mapping**: **DSH-0.1.2-A1-08** ("Web/API channels use process-scoped bootstrap tokens and signed cookies", security, Touchpoint #6, required-if-hit). Symptoms: "private routes that bypass auth become security holes". Recipe: custom routes registered outside the Connection gate do not automatically inherit auth/Host-Origin fence/CORS/TLS; the handler must call `ctx.connection.requestRejection(req)` first or move to a Connection-owned carrier. (The related dotted-endpoint 404 note under A1-01's field note also forbids assuming old `/api` wire shapes still work.)

### #7 Subprocess / stdout / stderr parsing — HIT (two sites, same wrong assumption)

- **Hit files/lines**:
  - `scripts/apply-patch.mjs:11-18` — runs `execFileSync('dsh', ['--profile', 'headless', 'ping'])` then `output.split('\n')` + `JSON.parse(line)` looking for `event.type === 'final'`. Comment line 11 admits it: "Deliberately wrong expectation: target headless stdout is final text, not JSONL."
  - `src/index.ts:56-66` — `spawn('dsh', ['--profile', 'headless', prompt])`; `child.stdout.on('data', ...)` `JSON.parse`s each chunk seeking `{ type: 'final' }`. Comment line 56: "Deliberately wrong wrapper assumption: treats headless stdout as JSONL."
- **Coupling points**: the headless bundle's stdout contract and exit-code semantics.
- **Card mapping**: **DSH-0.1.2-A1-05** ("Headless: stderr gains a `dsh: reasoning:` segment; stdout remains the final text", Touchpoint #7). Key evidence from the card: rc.2's stdout was *already* the final assistant text (never JSONL), so both parsers are broken on the current version too, and JSON.parse on the whole stdout will throw. Migration recipe: treat stdout as final text, consume `dsh: reasoning:` / `dsh: <code>: <message>` on stderr, judge success by exit code (0/1); "Do not `JSON.parse` stdout by default". (A1-04 also lists #7 for process-tree/profile-path coupling; the parsing defect itself is A1-05. A2-04's Node-24 loader fix touches #7 wrappers but this fixture has no Node-version workaround to remove.)

---

## Corridor folding summary (removed-then-restored rule)

Only one field in this fixture travels the fold: `SessionEvent.ignorable`. A1-02 (alpha.1, removal) and A2-01 (alpha.2, restoration) must be folded to the final net state: **on the 0.1.2-alpha.2 target the field is present and must be preserved, not deleted**. The card to action is A2-01 (retention semantics of envelope/persistence/reload/transport); A1-02 remains in the plan only as the recorded intermediate explaining why a mid-corridor migration would have required temporarily stopping the producer. Everything else in the fixture maps to net-breaking cards (A1-01, A1-03, A1-04, A1-05, A1-08) that were never reverted.

## Coverage statement for non-hit / partially-cleared categories

No category is fully clean — all seven touchpoints hit. The closest to clean, with what was ruled out:

- **#2, observer half only**: the `ctx.on('session/event')` observer (line 20) needs no change from the corridor cards; only the *producer* marker is card-governed. This is a partial clearance, not a category clearance.
- **#6, invocation half**: `startLegacyBridge` is never called (line 54), so no runtime channel exists today; the A1-08 exposure is latent source coupling that becomes a security hole the moment anyone wires it up. It must still be fixed or deleted in migration.
- **package.json**: scanned in full — no `@deepseek-ai/*` dependencies, no `dsh.client` roster entry, no peer ranges; so A1-25 (client-runtime removal), A1-24 (pi-ai dual instance), and A2-03/A2-08 (peer trim/add) have no direct hit here.
- **Why "no hit ≠ no problem"** (pre-flight.md, header): the touchpoint scan is explicitly "a heuristic scan, not proof of compatibility. Zero hits across the seven classes only means 'not detected by the current patterns'; you must still check dependencies/configuration and run a build, a real mount, and functional smoke tests." Additionally the ghost-host rule means a scan of the *disk* cannot certify a *running process*'s generation. Concretely for this fixture: the card list is curated, not a complete diff, and this fixture cannot compile by design, so the actual collision set can only be confirmed by a build + mount + smoke test against the alpha.2 tag after migration.

## Read-only discipline

Only read operations were performed on the fixture (directory listing + full file reads). Nothing under the fixture was written, renamed, or deleted; the report is the sole file created by this task.
