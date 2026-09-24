# S6 Migration Report · Corridor Net-State Judgment: the alpha.1 `ignorable`-deletion "defense"

- Target host: **alpha.2**
- Fixture analyzed read-only: `fixture/src/events.ts` (with `fixture/README.md`, `fixture/package.json`)
- No file under `fixture/` was modified; the fixture was not executed (per `package.json`: `"private": true`, "do not execute or publish").
- Scope note: closed-book brief. Only the fixture itself was consulted; everything not verifiable from the fixture is marked **unconfirmed** below.

## 1. Verdict: DELETE the defense code

The `delete (event as any).ignorable` line — and the comment justifying it — must be **removed** when migrating to alpha.2. The comment's instruction "迁移到 alpha.2 时这段要继续保留" ("keep this when migrating to alpha.2") is wrong.

### Corridor net-state reasoning (full history of the semantics)

| Version | Change ID | State of `SessionEvent.ignorable` retention semantics |
|---|---|---|
| before alpha.1 | — | Field exists; readers retain/honor it (per README's framing: alpha.2 "restored" these semantics) |
| alpha.1 | DSH-0.1.2-A1-02 | `SessionEvent.ignorable` **temporarily removed** |
| alpha.2 (target) | DSH-0.1.2-A2-01 | Retention semantics **restored** |

This is a classic **remove-then-restore** corridor: the net state at the end of the corridor (alpha.2) is the same as before alpha.1. The defense code was written against a *transient* alpha.1 hazard that no longer exists on the target host. Keeping an alpha.1-era workaround when migrating to alpha.2 hard-codes a temporary condition into permanent code — the defining mistake this task targets. The net-state rule is: **judge by the state at the destination version, not by states that existed only in intermediate versions.**

Three independent reasons to delete, in decreasing order of generality:

1. **Corridor argument.** DSH-0.1.2-A2-01 restored retention semantics in alpha.2, so the condition the defense guards against is gone at the target. (Stated by `fixture/README.md`; the primary SDK sources are not in the fixture — see §4.)
2. **The defense is a runtime no-op as written.** The event is created as `{ type: 'third-party/informational', payload }` — it never has an `ignorable` property. `delete (event as any).ignorable` therefore deletes a property that does not exist, which is a silent no-op in JavaScript/TypeScript. The code never had any protective effect, in alpha.1 or anywhere else.
3. **Keeping it is actively harmful going forward.** Once alpha.2 readers again honor/retain `ignorable`, a producer that strips the marker would suppress a meaningful flag (for any future event that legitimately sets it) and, worse, the misleading comment would push future maintainers to copy the anti-pattern into new code.

### On the comment itself

The comment is community hearsay ("——社区注释") and the fixture itself labels it a trap ("陷阱：alpha.2 已恢复保留语义，这段防御应当删除"). Its factual core is partially right (alpha.1 did remove `SessionEvent.ignorable`, per DSH-0.1.2-A1-02) but its inference is wrong on two counts:

- "不删 marker 会被 reader 拒绝" ("readers will reject it without deleting the marker") — unconfirmed, and moot here: the event never carries the marker (see reason 2 above).
- "迁移到 alpha.2 时这段要继续保留" — contradicted by DSH-0.1.2-A2-01; this is exactly the trap of carrying an intermediate-version workaround across a remove-then-restore corridor.

## 2. Correct producer semantics

The `ignorable` marker is an **envelope/platform-owned concern, not a producer payload concern**. The division of responsibility is:

- The **producer (plugin)** constructs the event content — `type` and `payload` — and hands it to the platform via `session.append(event)`. It must not mutate, strip, or forge framework-managed envelope fields such as `ignorable`. Those fields' presence and retention are decided by the platform and interpreted by readers.
- The **platform/reader side** owns marker retention. alpha.2's DSH-0.1.2-A2-01 restored retention semantics on that side; producers get the restored behavior automatically and need to do nothing.

As the task hint notes, **the public API surface may not even have that parameter**: alpha.1 removed `SessionEvent.ignorable` from the type (DSH-0.1.2-A1-02), and alpha.2's restoration is reader-side retention behavior, not a plugin-facing write parameter. An ordinary plugin going through `Session.append(...)` therefore has no legitimate way — and no need — to touch `ignorable`. (The fixture types `session` and `payload` as `any` and ships no DSH SDK types, so the exact `Session.append` signature cannot be confirmed from the fixture — **unconfirmed**; but the direction of the argument does not depend on the exact signature.)

Correct form of the function after migration:

```ts
export function produceExternalEvent(session: any, payload: any): void {
  session.append({ type: 'third-party/informational', payload })
}
```

i.e., delete line 6 (`delete (event as any).ignorable`) and lines 3–5 (the misleading comment). No replacement code is required; `session.append(event)` already delivers the restored alpha.2 semantics.

## 3. Decision basis

Per requirement 3, this decision rests on evidence in the fixture, not on the community comment:

- **Evidence used:** `fixture/README.md` (corridor DSH-0.1.2-A1-02 → DSH-0.1.2-A2-01, remove-then-restore; "the correct action is to delete this defense") and `fixture/src/events.ts` itself (the event literal provably never sets `ignorable`, making the `delete` a no-op — this is verifiable from the code alone).
- **Evidence rejected:** the in-code community comment's migration advice ("keep this in alpha.2"), which contradicts the README and the corridor net state.
- **Method:** read-only inspection; nothing under `fixture/` was modified, nothing was executed, and no external reference materials were consulted (closed-book).

## 4. Unconfirmed items

Marked per requirement 3 rather than guessed:

1. **Exact alpha.1 reader behavior.** The claim that alpha.1 readers *rejected* persistent events carrying `ignorable` is stated only in the community comment; it is **unconfirmed** (and moot on alpha.2, and doubly moot for this code path since the event never carries the marker).
2. **Primary-source verification of DSH-0.1.2-A1-02 / DSH-0.1.2-A2-01.** The corridor IDs and their remove/restore descriptions come from `fixture/README.md`. The actual DSH SDK sources/changelogs for alpha.1 and alpha.2 are not present in the fixture, so the exact `SessionEvent` shape and retention mechanics are **unconfirmed** from primary sources.
3. **Exact `Session.append(...)` signature** (and whether any producer-facing option related to `ignorable` exists at all): **unconfirmed** — the fixture declares `session: any` and includes no SDK typings.
