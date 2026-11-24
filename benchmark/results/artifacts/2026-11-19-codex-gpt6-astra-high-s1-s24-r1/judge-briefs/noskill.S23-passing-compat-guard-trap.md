# JUDGE BRIEF · noskill.S23-passing-compat-guard-trap

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

# S23 — Silent input-recall failure

## Attribution and evidence

The first broken read is `sessions.list.getSnapshot().current` in `resolve()`, not `sessions.scope(id)` and not keyboard registration. For a qualifying Ctrl+ArrowUp/ArrowDown event, the capture handler checks modifiers, composition, and composer target, then calls `resolve()`. The alpha.2 list snapshot no longer has `current`; reading a missing property on that ordinary snapshot yields `undefined`. The explicit `if (id === undefined) return null` runs immediately. The handler then returns at `if (resolved === null) return`. It never reaches scope resolution, conversation lookup, history extraction, draft mutation, `preventDefault()`, or `stopPropagation()`. This explains the unchanged composer cursor behavior.

The guard checks only `sessions.list`, `sessions.scope`, `sessions.sessionOf`, and `uiConversation.binding`. It never reads the snapshot or checks its fields. The supplied alpha.2 excerpt explicitly says `scope` still exists; its omission from that excerpt is not removal evidence. The reported passing guard is consistent with all four members remaining available. The compatibility banner therefore does not activate. A missing field read is not itself an exception, and the early-return branch contains no logging. No exception handler is necessary to explain the silence.

This settles why a clean console and passing guard did not establish compatibility, and supplies a concrete alternative to the suspicion of another plugin stealing the shortcut (already weakened by disabling other plugins). Re-linking or hard refresh cannot restore the removed field. The boot combo includes this client entry and reports no pending entries or duplicate loader IDs, which argues against discovery trouble, but is not a trace proving listener execution. Source inspection alone does not prove the listener fires or `isComposerTarget` succeeds at runtime; that helper and `compat.ts` are not supplied. Nor does this diagnosis validate every later chat-slot API or independently prove the update chip is fresh. The colleague's slot/inject suspicion is only partly resolved: adding an injection alone does not change the failing read; this path needs the new binding API. No slot registration appears in the supplied entry.

## Snapshot and replacement contract

In alpha.1, `SessionListState` is `{ byId, current }`, where `current: SessionId | undefined` identifies the main conversation session. Alpha.2 changes the observable's payload to `SessionListSnapshot`, containing `items`, `state`, `phase`, `error`, `subagentsByParent`, and `jobsBySession`. Neither `current` nor `byId` appears in this new contract. The list is now a catalog/reference-source snapshot; navigation belongs to view owners. Consequently, on a runtime snapshot matching the supplied alpha.2 type, every qualifying keypress reads `undefined` from `.current`, even when a session is visibly selected. That is a source/type-derived prediction, not an observed runtime measurement.

The canonical alpha.2 read is `ctx.uiSession.adapter.current.getSnapshot()`: `UiSession`, from the client bundle of `@deepseek-ai/dsh-client-ui-session`, has injection name `uiSession`. `adapter.current` is `ObservableSnapshot<SessionBindingValue>`. Its value carries `key` (session identity), `ctx` (the session-scoped context), `hooks`, `keyedHooks`, and `props`. Use `value.ctx` instead of `sessions.scope(value.key)`. The comment documents an absent binding whose `key` is undefined despite the interface's non-optional `key`; account for that sentinel explicitly. Do not pick a catalog item as a substitute for the main-view selection.

## One-build migration

Keep the existing required services and declare `uiSession` optional, so alpha.1 can still activate. For a host supporting the usual required/optional injection declaration, the intended declaration is:

```ts
export const inject = {
  required: ['sessions', 'uiConversation', 'conversation'],
  optional: ['uiSession'],
}
```

The evidence pack does not include the injection declaration type or optional-service reactivation semantics. Confirm that object spelling against the local SDK when implementing; the required behavior is optional injection, not adding `uiSession` to the existing required array. A required `uiSession` would prevent alpha.1 activation. Avoid a runtime import of the new package in a shared build; use an erased type import or a narrow structural boundary as below.

Replace `resolve` inside `applyBody` with the following, retaining its existing `browse`, `lastSessionId`, `sessions`, `EMPTY_NODES`, and conversation types. These boundary types deliberately represent the documented absent binding and the legacy snapshot without pretending alpha.2 still declares `current`.

```ts
type RecallBinding = {
  readonly key: string | undefined
  readonly ctx?: ClientContext
}
type RecallUiSession = {
  readonly adapter: {
    readonly current: { getSnapshot(): RecallBinding }
  }
}
type RecallHost = ClientContext & {
  readonly uiSession?: RecallUiSession
}

const resolve = (): ResolvedSession | null => {
  let id: string | undefined
  let actx: ClientContext | undefined
  const uiSession = (ctx as RecallHost).uiSession

  if (uiSession !== undefined) {
    // The new view owner is authoritative, including its absent binding.
    const binding = uiSession.adapter.current.getSnapshot()
    id = binding.key
    actx = binding.ctx
  } else {
    // Only hosts without the new service use the alpha.1 contract.
    const legacy = sessions.list.getSnapshot() as unknown as {
      readonly current?: string
    }
    id = legacy.current
    actx = id === undefined ? undefined : sessions.scope(id)
  }

  if (id !== lastSessionId) {
    browse = IDLE
    lastSessionId = id
  }
  if (id === undefined || actx === undefined) return null

  const conversation = actx.get('conversation') as
    IConversation | undefined
  if (conversation === undefined) return null

  const chat = ctx.uiConversation.binding(id)
    .snapshot.getSnapshot().views.get('chat')
  const nodes = chat === undefined ? EMPTY_NODES : chat.legacy.nodes
  return { input: conversation.input.for(actx), nodes }
}
```

Read the binding anew for every keypress, preserving selection changes. A present alpha.2 service with an absent binding must yield no-op behavior rather than falling back to a stale legacy selection. Pass the binding's scoped context both to `get('conversation')` and `conversation.input.for(actx)`; resolving only the root conversation would lose the session scope. The reset above also clears browsing when selection becomes absent. The remaining chat extraction is retained from the supplied entry; the evidence does not establish that every downstream chat API is unchanged. Hardened validation and verification must check it.

## Guard hardening and lifecycle

Service-member presence checks cannot detect a changed return payload, removed nested field, wrong scope, or altered meaning of an existing API. Validate the contract consumed by the selected resolution branch rather than using unrelated members such as `sessionOf` as a compatibility proxy:

- On a legacy host, call `list.getSnapshot()` and verify the snapshot is an object with a `current` field (`'current' in snapshot`), allowing its value to be undefined when nothing is selected. An absent field is incompatible; an undefined value in a present field is not. When selected, validate identity and `scope(id)` resolution.
- On a new host, validate callable `adapter.current.getSnapshot` and inspect its returned binding. Accept the documented absent-selection sentinel. With a live binding, require a usable key and context with callable `get`; resolve the scoped conversation and verify `input.for(actx)` returns the expected draft snapshot and `setDraft` methods. Validate the chat view shape before accessing `legacy.nodes`, while preserving legitimate missing-chat behavior.
- If neither branch's structural contract is supported, render the remediation banner and disable recall deliberately. If a service is present but malformed, report that contract failure rather than silently hiding it with legacy fallback.

Run structural probes during activation after injected services are ready and before enabling the listener. Run the selected-session probe once a real main-view binding/session is available, and repeat on binding changes or service replacement/unload. Initial absence is a pending state, not proof of incompatibility or successful validation. The provided excerpts do not specify subscription APIs, so no invented subscription call is necessary here. For this particular old implementation, inspecting the list snapshot's field presence at activation would already detect the alpha.2 break even without a selected session. Emit a bounded diagnostic identifying the failed field/path; avoid a console flood on each keypress.

## Verification without a full migration

Use isolated alpha.1 and alpha.2 host environments with only a rebuilt plugin linked, or a small local harness providing the attached contracts; no global upgrade or migration is required for the first checks. A mock proves branch behavior, while both actual hosts are needed to validate injection, bundling, and UI integration.

1. Reproduce the old resolver against an alpha.2-shaped list: undefined current, null result, no draft write or event cancellation. Confirm the hardened legacy guard flags the missing field.
2. Run the shared build against alpha.1 without `uiSession`: activation succeeds, `scope(current)` supplies the context, Ctrl+Up recalls and Ctrl+Down walks back, and session changes reset browsing.
3. Run the same build against alpha.2 with no `list.current`: use a known binding key and scoped context. Confirm scope lookup is unnecessary on this branch, the conversation receives that exact context, and both chords update the intended composer's draft. Switch main sessions and verify no history bleed.
4. Check absent selection on both hosts, malformed snapshot diagnostics, legitimate missing chat, composition/unrelated targets, and listener cleanup on unload/reload. An absent alpha.2 binding must not fall through to a legacy ID. In the real UI, observe the handler/resolver with a breakpoint or temporary diagnostic to distinguish non-firing from an early return.

A single host-side runtime change that would have made the existing guard fail loudly at activation is to remove/decommission the obsolete `sessions.scope` member along with the incompatible list contract. Because this guard explicitly checks `scope`, it would then present its remediation banner instead of silently installing a nonfunctional listener. This is a breaking change affecting other consumers, not a claim that alpha.2 actually removed it or a recommendation to remove it indiscriminately. Merely deleting `current` from a type declaration catches a rebuilt, properly checked plugin at compilation; it cannot force an already-built JavaScript plugin to fail at activation. Likewise a throwing `.current` getter alone would throw only on the first resolver call, because this shipped guard never reads the snapshot.

## Scope and limits

Single no-skill attempt. Read only the task instruction and attached fixture; no skills, network, other repository material, external tests, or graders were consulted. Fixture files were not changed. This is a source/type analysis and migration recipe, not a compiled or runtime-verified patch. Missing full SDK/injection declarations, plugin helper sources, and executable hosts prevent validating the proposed build and live behavior here; they do not block the field-removal attribution.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.