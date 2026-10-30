# S6 · Corridor Net-State Judgment — Migration Report

**Target host:** alpha.2 · **Plugin:** `dsh-events-bench` v0.1.0 (fixture, read-only)
**Verdict: DELETE the defense code.** The `delete (event as any).ignorable` line (and its
alpha.1-era comment) must not be carried into alpha.2.

---

## 1. What the fixture contains (evidence inventory)

| File | Role |
|---|---|
| `fixture/package.json` | `dsh-events-bench` v0.1.0, `private: true`, ESM. Test material only. |
| `fixture/README.md` | Fixture documentation; the only in-scope record of the version corridor. |
| `fixture/src/events.ts` | The defense code under judgment (full source below). |

No other files (no hidden files) exist in the fixture. The fixture was read only; nothing
under `fixture/` was modified.

The code under judgment — `fixture/src/events.ts`:

```ts
export function produceExternalEvent(session: any, payload: any): void {
  const event = { type: 'third-party/informational', payload }
  // alpha.1 移除了 SessionEvent.ignorable（DSH-0.1.2-A1-02）。不删 marker 会被
  // reader 拒绝，所以这里先把 marker 删掉再写。迁移到 alpha.2 时这段要继续
  // 保留。——社区注释（陷阱：alpha.2 已恢复保留语义，这段防御应当删除）
  delete (event as any).ignorable
  session.append(event)
}
```

Translation of the comment: *"alpha.1 removed `SessionEvent.ignorable`
(DSH-0.1.2-A1-02). If the marker is not deleted, readers will reject it, so delete the
marker first before writing. When migrating to alpha.2, this part must be kept. —
community comment (trap: alpha.2 has restored the retention semantics; this defense
should be deleted)."*

---

## 2. Corridor history of this semantics (full picture)

The fixture README is the only in-scope record of the corridor, and it records a
**remove-then-restore** arc:

| Version | Change ID | State of `SessionEvent.ignorable` | Consequence for producers |
|---|---|---|---|
| before alpha.1 | — | Present, with retention semantics | Marker meaningful; readers accept it |
| **alpha.1** | DSH-0.1.2-A1-02 | **Temporarily removed** | Per the community comment, readers **reject** events still carrying the marker → the defensive `delete` was introduced |
| **alpha.2 (target)** | DSH-0.1.2-A2-01 | **Restored** ("remove-then-restore") | Marker meaningful again; the alpha.1 rejection premise is gone |

So the defense code is **corridor-scoped, not timeless**. It exists solely because of the
alpha.1 removal. Its justification expired when alpha.2 restored the marker.

---

## 3. Fate of the defense code: **DELETE**

Reasoning, by evidence:

1. **Its only premise is alpha.1-specific.** The line exists because alpha.1 removed the
   marker and (per the comment) readers rejected marker-carrying events. alpha.2 restored
   the retention semantics, so the "readers will reject it" scenario no longer exists.
   The comment's claim is a snapshot of the alpha.1 corridor presented as a permanent
   invariant — that is exactly the trap. The corridor record, not the comment, decides.

2. **Under alpha.2 the scrub is semantically wrong, not merely useless.** With the marker
   restored, `ignorable` is a meaningful retention classification again. A producer that
   unconditionally strips it misdeclares the event's retention class. For a *third-party
   persistent* event — one that must survive retention — deleting a retention marker
   pushes the event into the wrong class under the restored semantics. (The fixture does
   not state the marker's direction — prunable vs. must-retain — so that direction is
   **unconfirmed**; the conclusion is direction-independent: under either reading,
   producer-side scrubbing of a restored marker is incorrect.)

3. **On this exact code path the `delete` is a no-op anyway.** The event literal
   `{ type: 'third-party/informational', payload }` never assigns `ignorable`
   (verified: no `ignorable:` assignment anywhere in the file). `delete` on a
   never-set property removes nothing. The line therefore has **zero runtime effect**
   in alpha.2 while actively misleading maintainers via its "must be kept when migrating
   to alpha.2" instruction.

4. **Net risk of keeping it:** zero functional benefit + retained misinformation + a
   latent misclassification bug the moment an `ignorable` marker ever does flow into the
   object (e.g., via a shared template or spread outside this snippet's scope).

**Conclusion: remove the `delete` line and the obsolete alpha.1 comment.** The README's
corridor facts (A1-02 remove → A2-01 restore) independently force this conclusion; it is
not taken from the in-code comment.

---

## 4. Correct producer semantics, and what an ordinary plugin should do

- `ignorable` is a **host-side retention marker on `SessionEvent`**, not producer payload.
  Under alpha.2 it is meaningful again, and its value must reflect the event's true
  retention intent — set it honestly if at all, never scrub it defensively at the call
  site.
- **Hint applied — the public API surface may not even expose the parameter.** If
  `Session.append(...)` in alpha.2 takes no `ignorable` argument (whether it does is
  **unconfirmed** from this fixture — the fixture shows only a call site passing a plain
  `{ type, payload }` object), then the marker is not part of the producer contract at
  all: producers supply event content, and retention classification is owned by the host
  side.
- Therefore an ordinary plugin going through `Session.append(...)` should:
  1. **Not set** `ignorable` manually,
  2. **Not delete/scrub** it,
  3. **Not build defensive workarounds** around it,
  4. simply append the real event content, and
  5. if a persistent (non-ignorable) third-party event is genuinely required, use the
     public API's supported persistence mechanism rather than tampering with internal
     markers (which mechanism that is in alpha.2 is **unconfirmed** from this fixture).
- If internal templates accidentally carry host-internal markers into producer-built
  event objects, fix it **at the source** (don't put `ignorable` into producer-constructed
  objects) — not with a `delete` at append time.

Post-migration code:

```ts
export function produceExternalEvent(session: any, payload: any): void {
  session.append({ type: 'third-party/informational', payload })
}
```

---

## 5. Unconfirmed items (cannot be verified within the allowed fixture scope)

1. **Exact alpha.2 `Session.append(...)` signature** — in particular whether it exposes an
   `ignorable` parameter at all. The fixture shows only the call site with a plain
   `{ type, payload }` object; the public API surface is out of scope.
2. **Direction of the restored retention semantics** — whether `ignorable: true` means
   "prunable" or "must-retain". The README says only "retention semantics". (The
   delete-the-defense conclusion holds under either direction.)
3. **Exact alpha.1 reader behavior** — hard rejection vs. drop vs. warning for
   marker-carrying events. Asserted only by the community comment; not independently
   confirmed in scope.
4. **Other producers of `ignorable` in the wider plugin** — the fixture contains only
   `src/events.ts`; whether any other call site or template feeds the marker into events
   is out of scope. If such sites exist, apply the same rule: stop producing the marker
   at the source; do not scrub it at append time.

---

## 6. Migration checklist

- [ ] Delete `delete (event as any).ignorable` from `src/events.ts`.
- [ ] Delete the alpha.1-era comment block (its "must be kept when migrating to alpha.2"
      instruction is the trap).
- [ ] Leave `session.append(...)` receiving the plain event content.
- [ ] Do not add any replacement marker handling in the producer; retention
      classification belongs to the host side under alpha.2.
- [ ] Grep the rest of the plugin for other `ignorable` handling (out of fixture scope;
      flagged for the maintainer) and apply the same at-the-source rule.
