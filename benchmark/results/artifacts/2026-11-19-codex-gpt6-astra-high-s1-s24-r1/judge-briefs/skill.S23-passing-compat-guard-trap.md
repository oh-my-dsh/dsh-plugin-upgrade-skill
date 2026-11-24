# JUDGE BRIEF · skill.S23-passing-compat-guard-trap

## Criteria (sealed rubric)
- [silent-break-attribution] (20pt) Walk resolve() in plugin/src-client-index.ts: sessions.list.getSnapshot() succeeds but the published snapshot no longer carries current, so id is undefined and the function returns null on every keystroke; onKeyDown then exits before preventDefault. Explain both silences: the four presence probes in the compat guard all survive (the service, its members, even the observable exist — only a field inside the published value is gone), and undefined was a legitimate no-session state the code deliberately ignores quietly. Do not claim the sessions service or the guard itself was removed, renamed, or throws.
- [evidence-mapping] (20pt) From session-list-alpha1.d.ts vs session-list-alpha2.d.ts: SessionListState.current is gone and navigation moved to view owners (ISessions.list doc comment). From ui-session-service-alpha2.d.ts: the canonical replacement is the uiSession service — adapter.current (ObservableSnapshot<SessionBindingValue>) yielding { key, ctx, hooks, keyedHooks, props }, where key replaces current and ctx is the session-scoped context replacing sessions.scope(id). Mapping to card DSH-0.1.6-A2-01 is creditable; the card alone without the type-walk earns partial at most.
- [dual-host-migration] (20pt) Propose a corrected resolution: read ctx.uiSession.adapter.current.getSnapshot() when the service exists, fall back to the legacy current field plus sessions.scope otherwise, from one build; inject gains uiSession; the conversation service resolves through the binding value ctx (scope.get('conversation')), and input.for receives that scope. Accept equivalent shapes and guard order. A recipe that only works on alpha.2 (no fallback) or that keeps reading the removed field earns partial; re-registering slots or merely re-declaring inject without the code change earns zero.
- [guard-hardening] (20pt) Name the breakage class the shipped guard cannot catch: field-level removal behind service-level stability, checked once at activation while the break recurs per use. Specify a hardened guard that probes the actual capability (assert the specific snapshot field on alpha-1-shaped hosts and/or feature-detect uiSession on alpha-2-shaped hosts) and note the probe must run lazily or per-use, not only at activation. Presence-list expansion alone is insufficient.
- [verification-and-prevention] (20pt) Verify without a full migration: a temporary probe of adapter.current key with one session open, chord behavior after the code change on both hosts, and typecheck against alpha.2 published types as the strongest pre-ship gate. Prevention: a removed public snapshot field should fail loud — a deprecated getter that throws/warns on read, or a runtime snapshot-shape contract guards can pin. Do not require executing this static fixture.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [slot-reregistration-misdiagnosis] ceiling=40 The final remedy is only re-registering slots, re-declaring inject, or reinstalling the plugin — the colleague red herring — without the current-session code fix. Apply only to affirmative final advice or conclusions. Quoted, hypothetical or explicitly rejected bad examples do not trigger the cap; read the whole report.

## Candidate report(s)
#### FILE: S23-passing-compat-guard-trap/report.md

# S23 — Read-only diagnosis and migration recipe

## Scope and evidence

Mode A inspection; BENCHMARK-AUTH-v1 authorizes this report. No fixture, installation, profile, or plugin source was modified. No network, installation, migration, package scripts, evaluator, or tests were run. The plugin repository, package manifest, lockfile, Git identity, and Node version are unavailable, so their baseline is not collected. Installation identity is npm-global DSH on Windows, web profile, six junction-linked external client plugins; host corridor is 0.1.6-alpha.1 → 0.1.6-alpha.2. The plugin's release version is unspecified; its “latest” chip does not establish host compatibility.

Read skills/plugin-upgrade/SKILL.md and relevant reference material, especially DSH-0.1.6-A2-01 and strict/optional injection guidance. The supplied type excerpts take precedence over general cards: the card mentions an alpha.2 `byId`/`retainedBy` alternative, but this fixture declares `items` and provides no such marker. Do not invent that catalog lookup here. The card also says uiSession exists on both tags; the pack only supplies its alpha.2 declaration and calls it new. The recipe below does not require the new adapter on the legacy path.

## 1. Exact failure and why it is silent

In plugin/src-client-index.ts, apply() submits four values to applyWithCompat: sessions.list, sessions.scope, sessions.sessionOf, and uiConversation.binding. All remain present in the reported host. The alpha.2 excerpt explicitly says scope still exists even though omitted from the excerpt. None of these checks reads the list snapshot's `current` field. The reported passing guard therefore admits applyBody and its document capture listener. compat.ts itself is not supplied, so this conclusion concerns the observed guard and its visible inputs, not invented internals.

For a Ctrl+ArrowUp/ArrowDown event, onKeyDown first rejects Alt/Meta, other keys, composition events, and non-composer targets. If those gates pass, resolve() executes:

```ts
const id = sessions.list.getSnapshot().current
if (id === undefined) return null
```

The exact broken read is `.current` on the object returned by `sessions.list.getSnapshot()`, not access to sessions or invocation of getSnapshot. Alpha.2 no longer publishes that property. Reading a nonexistent JavaScript property on a valid object returns undefined; it does not throw. Thus every eligible keystroke returns null at this first check, even with a main conversation visibly open.

Nothing reaches the session-switch reset, sessions.scope(id), actx.get('conversation'), uiConversation.binding(id), conversation.input.for(actx), history extraction, or draft update. onKeyDown returns before preventDefault and stopPropagation, explaining the unswallowed chord and native cursor behavior. There is no logging or diagnostic on this return path and no exception for the console to report. The activation guard never evaluates the faulty data contract, so no compatibility banner appears. A missing warning is exactly what this source predicts.

This resolves the symptom-report ambiguity “listener not firing or firing and bailing out”: the supplied active code has a deterministic early bailout on alpha.2. It explains why a clean F12 console and passing banner check do not vindicate compatibility. Together with the boot roster, restart/hard refresh and no pending entries, it makes a broken junction or missing combo entry unnecessary to explain the failure. Disabling all other plugins and the key-conflict experiment support the absence of a competing handler. Source inspection alone does not independently prove the live listener ran, establish the implementation of isComposerTarget, or certify that the served bytes match this excerpt; a breakpoint can verify those. Removing this plugin and observing no other handler is not a test of this plugin's resolver.

The colleague's multi-instance API suspicion is correct. Merely re-registering a slot or adding uiSession to inject cannot repair an unchanged `.current` read: this helper uses a document listener, not a session slot. Injection is part of the fix, paired with changing resolution. This diagnosis does not audit every slot or runtime-unload lifecycle change mentioned in the release notes.

## 2. Type evidence and replacement contract

* alpha.1: ISessions.list is ObservableSnapshot<SessionListState>; its value has `byId` and `current: SessionId | undefined`. `current` represents the main conversation view. scope(id) returns a session Context or undefined.
* alpha.2: ISessions.list is ObservableSnapshot<SessionListSnapshot>; its fields are `items`, `state`, `phase`, `error`, `subagentsByParent`, and `jobsBySession`. Neither `current` nor `byId` is declared. This is a catalog/local-reference snapshot, with navigation owned by views. A catalog item existing does not establish which view is current. Legacy emitted JavaScript now reads undefined on every press, whereas recompilation against the exact new declarations would flag the direct `.current` access.
* Canonical replacement: UiSession, provided by @deepseek-ai/dsh-client-ui-session under inject name `uiSession`, exposes `adapter.current`, an ObservableSnapshot<SessionBindingValue>. Read `ctx.uiSession.adapter.current.getSnapshot()`. The binding carries `key` (session id), `ctx` (session-scoped Context), `hooks`, `keyedHooks`, and `props`. Its `ctx` replaces `sessions.scope(id)` on this path; `key` supplies the id for uiConversation.binding(id).

The excerpt types key as SessionId but explicitly documents an absent binding whose key is undefined. Treat absence as legitimate and narrow key before resolving services; do not mistake it for an incompatible host or fall back to an unrelated session.

## 3. Concrete dual-host recipe

Keep existing required services and declare uiSession as optional for a build that must also activate where that service is unavailable. The Cordis declaration is:

```ts
export const inject = {
  required: ['sessions', 'uiConversation', 'conversation'],
  optional: ['uiSession'],
}
```

If the exact supported profile contracts guarantee uiSession on both hosts (as the general card states), adding `'uiSession'` to the existing required array is also valid. Optional declaration is the conservative cross-host choice; do not make an alpha.2-only service a mandatory activation dependency and thereby prevent alpha.1's fallback from running. Verify this declaration with the actual Cordis package in the author's repository; that package is not included here.

Replace the resolver inside applyBody with the following. It reuses ResolvedSession, EMPTY_NODES, browse, lastSessionId, sessions, and the existing imports. The local structural types deliberately describe only the consumed cross-version surface, avoiding a runtime import of an alpha.2-only package. Use the authoritative host types in each host's compile check as well.

```ts
type SessionId = Parameters<ISessions['scope']>[0]
type MainBinding = {
  readonly key: SessionId | undefined
  readonly ctx?: ClientContext
}
type OptionalUiSession = {
  readonly adapter?: {
    readonly current?: { getSnapshot(): MainBinding }
  }
}

const resolve = (): ResolvedSession | null => {
  const uiSession = ctx.get('uiSession') as OptionalUiSession | undefined
  const current = uiSession?.adapter?.current
  let id: SessionId | undefined
  let actx: ClientContext | undefined

  if (current && typeof current.getSnapshot === 'function') {
    const binding = current.getSnapshot()
    id = binding.key
    actx = id === undefined ? undefined : binding.ctx
    // An available adapter is authoritative, including its absent binding.
  } else {
    const snapshot = sessions.list.getSnapshot() as unknown as {
      readonly current?: SessionId
    }
    id = snapshot.current
    actx = id === undefined ? undefined : sessions.scope(id)
  }

  if (id !== lastSessionId) {
    browse = IDLE
    lastSessionId = id
  }
  if (id === undefined || actx === undefined) return null

  const conversation = actx.get('conversation') as IConversation | undefined
  if (conversation === undefined) return null
  const chat = ctx.uiConversation.binding(id)
    .snapshot.getSnapshot().views.get('chat')
  const nodes = chat === undefined ? EMPTY_NODES : chat.legacy.nodes
  return { input: conversation.input.for(actx), nodes }
}
```

On alpha.2 this uses the binding key and binding ctx. On alpha.1 without this adapter it reads the legacy current field and calls scope(id); if alpha.1 provides the same adapter, that canonical path works too. There is no fallback after an available adapter reports no session. The session context is used both to obtain the scoped conversation service and as the argument to conversation.input.for; substituting the root ctx would lose the session scope. The same session id selects chat nodes. Resetting browse when the selection becomes absent also prevents stale browsing state after closing and reopening the same session.

Update the compatibility guard with this resolver change; retaining scope as an unconditional guard requirement is unnecessary on the adapter branch. Keep UI binding requirements and branch-specific checks, and omit unused sessionOf from the functional contract unless other source actually consumes it. Adding injection alone is insufficient.

## 4. Harden the guard at the data boundary

Member-presence checks catch missing services, not changed result shapes, semantics, session ownership, or lifecycle readiness. Probe the actual observable snapshot and the path that will be used:

* At activation, after declared dependencies are available, verify callable getSnapshot/binding functions. Accept an adapter snapshot only with its expected binding shape, including a key field (undefined is permitted for absence). Otherwise require a legacy snapshot that actually contains `current`, with an undefined or valid id. Checking only `snapshot.current === undefined` cannot distinguish a removed field from a legitimate empty main view; check property presence too. Reject neither supported path available with the remediation banner and do not arm the handler.
* As soon as the main view has a real bound session, validate the nonempty path: id/key matches the intended view, the scoped ctx resolves conversation, its input.for(ctx) yields the input facade, and the chat snapshot has the expected views/nodes contract. Do not mutate the draft for a compatibility probe. Subscribe or rerun on binding readiness/selection changes. No session at initial activation is a normal pending behavioral probe, not proof of compatibility or a permanent incompatibility banner.
* Surface malformed values and persistent contract failure through a once-per-activation diagnostic/banner instead of repeatedly treating them as “no session.” Keep legitimate absent bindings as harmless no-ops. Dispose the subscription and keyboard listener on unload.

For this precise failure, the activation-time legacy snapshot field-presence check already catches the removed field without requiring a keystroke. The readiness probe additionally covers semantic and scoped-service failures that only appear once a session is active.

## 5. Verification and prevention

A full host/profile migration is unnecessary to validate this small adapter change. In a disposable local harness using each supplied shape, run the same emitted resolver against alpha.1's `{byId, current}` plus scope and alpha.2's catalog plus adapter binding. Assert correct id, exact scoped ctx passed to input.for, nodes for the same id, legacy fallback, session switch reset, absent binding, and no fallback from an absent modern binding. Include a negative case with all four original guard members present but no list.current and no replacement adapter: the hardened guard must report incompatibility. Also check that opening a session after initially empty activation finishes the deferred probe.

Then, when the author's source and both existing host runtimes are available, compile the one plugin source against each exact declaration cohort and smoke-test the same plugin artifact on two isolated profiles without upgrading the user's installation. Confirm activation and served artifact identity, set a breakpoint at resolve to establish listener execution, open a session with known sent messages, and test Ctrl+Up/Down draft recall, draft restoration, session switching, no open session, IME/non-composer filtering, and disable/re-enable cleanup. Check both the resolver values and visible draft behavior; build success, HTTP 200, or boot roster presence alone is insufficient. Preserve the six-plugin profile for a final interaction check after the isolated check.

Single host-side prevention change: expose the incompatible catalog under a newly named service member (for example `sessions.catalog`) and retire `sessions.list`, rather than retaining `list` with a silently incompatible result. This plugin's existing `sessions.list` presence check would then fail during activation and its compatibility banner would appear before the listener is installed. This is a host API design recommendation, not an instruction to modify core in this task. A throwing tombstone getter for the retired member could likewise make old access loud, but would be a different design. Merely changing TypeScript declarations cannot force an already compiled JavaScript plugin to fail at activation; it only catches the old access when rebuilt. A service/contract-version gate could provide a broader negotiated solution but would require corresponding consumer declarations.

## Status

Completed: source/type attribution, evidence mapping, dual-host recipe, guard design, and verification/prevention plan. Applicable card: DSH-0.1.6-A2-01. Pre-existing mechanical failures: not collected. Skipped: installations, host upgrades, source edits, full suite, and real mount; the evidence pack is read-only and lacks the author's repository/runtime harness. No executed-test success is claimed. Pending: actual compilation of the recipe, Cordis optional injection validation in the author's package, runtime readiness behavior, exact served-source identity, and two-host functional verification. These do not block the evidence-based report. Rollback: fixture untouched; only this report was created, so there is no runtime/source rollback to perform.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.