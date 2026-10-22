# JUDGE BRIEF · noskill.S6-corridor-net-state

## Criteria (sealed rubric)
- [corridor-net-state] (25pt) Explain alpha.1 removal followed by alpha.2 restoration of SessionEvent.ignorable retention, applying the final alpha.2 state to produceExternalEvent in src/events.ts. Correct version history is required; bare A1-02/A2-01 card names earn no credit, and equivalent history without card IDs is acceptable.
- [remove-marker-stripping] (25pt) Locate delete (event as any).ignorable and reject the comment prescribing continued stripping on alpha.2. Recommend removing that defense and correcting its obsolete rationale. Distinguish removing the stripping code from removing the marker itself. It is valid to note that the shown literal currently has no marker, so the delete is a no-op, while still rejecting the intended stripping policy.
- [informational-producer] (25pt) Explain that only informational events whose semantics old readers may omit without breaking reconstruction can carry ignorable:true; required events must not be made ignorable. Retention across persistence/reload is not a reader-side filtering instruction: marked events remain in the loaded log. Apply this to the third-party/informational producer while respecting the live append limitation.
- [public-append-gap] (25pt) Identify the public live Session.append capability gap: it has no supported ignorable parameter. Ordinary plugins must not fake an entry with a cast, invented argument or unsupported API. Explicitly defer the exact producer/persistence integration pending target API verification; naming an undocumented successor is not required. Proposed retention/required-event checks are valid but actual execution is not required.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [keep-stripping-marker] ceiling=10 Trigger only when the final recommendation affirmatively keeps the alpha.1 defense or continues deleting the marker on alpha.2. Negating that recommendation, quoting the old code for diagnosis, or removing the delete statement does not trigger it. Read the entire sentence and conclusion, including double negation and later contradictions.

## Candidate report(s)
#### FILE: S6-corridor-net-state/S6-corridor-net-state-migration-report.md

# S6 · Corridor Net-State Judgment — Migration Report

**Subject:** `fixture/src/events.ts` → `produceExternalEvent(session, payload)`
**Target host:** alpha.2
**Mode:** read-only analysis. No file under `fixture/` was created, modified, moved or deleted.
**Report date:** 2026-10-21 (run time)

---

## 0. TL;DR verdict

| Question | Answer |
|---|---|
| Fate of the `delete (event as any).ignorable` defense | **DELETE it.** It is an obsolete, alpha.1-only workaround. |
| Primary reason (corridor) | The corridor is *remove-then-restore*: alpha.1 removed the semantics (DSH-0.1.2-A1-02), alpha.2 **restored** them (DSH-0.1.2-A2-01). alpha.2 therefore has the **same net semantics as the pre-alpha.1 baseline**, in which no marker handling existed. A workaround for a transient regression is not to be carried forward across a restore. |
| Secondary reason (code-level) | The statement is a **no-op in this code path**: the event literal it is applied to never has an own `ignorable` property, so `delete` removes nothing. The comment's causal story ("without deleting the marker readers will reject it") never described this function's actual behavior. |
| Correct producer semantics on alpha.2 | A third-party plugin writes a **plain** event — `{ type, payload }` — and appends it. It must **neither set nor delete** host-internal `SessionEvent` fields. Marker presence/absence is a property of the event the *host* produces and of the host's own reader validation, not something a third-party producer hand-manipulates. |
| What an ordinary plugin using `Session.append(...)` should do | Call `session.append(event)` with the plain event and stop. The retention/`ignorable` knob is **not part of the public `Session.append(...)` surface** on alpha.2, so it must not be emulated by mutating the event object or by passing an extra field/argument. |

**Bottom line for the maintainer:** the comment's migration instruction ("keep this when migrating to alpha.2") is wrong and must not be followed. Delete the defense line and its comment; keep the append.

---

## 1. What was inspected (read-only)

| Path | Role |
|---|---|
| `fixture/src/events.ts` | the code under judgment (the "defense code" + the community comment) |
| `fixture/README.md` | fixture-level statement of the alpha.1 → alpha.2 semantic change |
| `fixture/package.json` | `"private": true`, `type: module` — test material only; nothing was built or run |
| `instruction.md` / `solver-prompt.txt` | the task brief (analysis scope, read-only constraint) |
| `fixture-seal.pre.json` / `fixture-seal.source.json` | SHA-256 seals for the three fixture files |

**Integrity check performed:** SHA-256 of all three fixture files was recomputed and compared against both seal manifests — `README.md`, `package.json`, `src/events.ts` all match, i.e. the fixture is byte-identical to its sealed baseline. No file in the whitelist tree outside `agent-output/` was written.

**Not consulted** (per the brief's self-containment rule and the ARM clause): no `skills/` path, no `tests/`, no `solution/`, no other repository directory, no network, and no live-host introspection (`dsh --version`, `--dump-config`, `cordis_inspect_*`, etc.). The installed host runs a different version than the alpha.2 target, so nothing was probed from it. All conclusions below derive from the brief and the fixture only.

---

## 2. The code under judgment

`fixture/src/events.ts` (verbatim shape, quoted because the report is about it):

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

Three separate claims are embedded here, and they do not all have the same standing:

1. **"alpha.1 removed `SessionEvent.ignorable` (DSH-0.1.2-A1-02)."** — corroborated by the fixture's own README, which cites the same change ID for the removal. **Supported.**
2. **"Without deleting the marker, readers will reject it."** — this is a *community assertion about alpha.1 behavior*. It is not contradicted by the fixture, but nothing in the fixture demonstrates it either. It is also **inapplicable to this code path** (see §4) and **moot for alpha.2** (see §3).
3. **"This must be kept when migrating to alpha.2."** — **directly contradicted by the fixture README** and by the trailing annotation in the very same comment. **Wrong. This is the instruction the brief warns against following.**

The brief's rule is "decide by evidence, not by the comment" — so the comment's own migration directive carries no weight; the fixture README's account of the corridor and the code's actual runtime behavior do.

---

## 3. The full corridor history of this semantics

The fixture states the corridor shape explicitly in `fixture/README.md`: alpha.2 **restored** the retention semantics removed in alpha.1, i.e. **DSH-0.1.2-A1-02 → DSH-0.1.2-A2-01 is a remove-then-restore** pair. Reconstructed timeline:

| Phase | `SessionEvent.ignorable` semantics | Obligation on a third-party producer | Defense code status |
|---|---|---|---|
| **Baseline (pre-alpha.1)** | The field exists and behaves normally; the host's session/net-state keeps events (and their marker) as produced. | Write a plain event; no marker handling. | Not needed — it did not exist. |
| **alpha.1** (DSH-0.1.2-A1-02) | **Removed** (the field was temporarily taken out of the host's `SessionEvent` shape). Under this regime, producing an event that *carried* the marker was reported to be rejected by a reader. | Defensive scrubbing of the marker was a reasonable stop-gap *for that window only*. | **Written here.** The defense is an artifact of this single phase. |
| **alpha.2** (DSH-0.1.2-A2-01) — **target** | **Restored.** The removal was reverted; retention semantics are back to the baseline behavior. | Again: write a plain event; no marker handling. | **Obsolete → delete.** |

**Why "remove-then-restore" is decisive.** A migration decision is not "is the removed thing back?" but "does the target's *net* semantics equal the semantics the code was written against?" Here they do: alpha.1 removed the behavior, alpha.2 put it back, so **alpha.2 ≡ baseline**. The defense was authored to compensate for a *transient* deviation from the baseline. Once the baseline is restored, the compensation has no target left — and, worse, the code carries a false invariant forward ("readers will reject the marker") that is no longer true of the host.

Two secondary consequences of the corridor shape:

- **A fix written against a regression is not automatically a fix to carry forward.** The usual migration rule is "keep what the new version still requires"; the corridor here shows the requirement itself was withdrawn and then re-established as originally intended, so the correct state to migrate to is the *baseline*, not the alpha.1 workaround.
- **The risk is asymmetric.** Keeping the defense in a world where the marker is legal and meaningful means: (a) preserving a false comment that will mislead the next maintainer, and (b) in any code path where the event *does* end up carrying the marker, actively **stripping a now-valid field** — i.e. causing the very failure the comment feared, rather than preventing it. Deleting the defense cannot regress alpha.2 behavior, because the statement mutates a property that is not present.

---

## 4. Independent code-level finding: the defense never did anything

This is verifiable purely from the fixture and does not depend on any changelog:

- The event is built inline as `{ type: 'third-party/informational', payload }`. That literal has **no own `ignorable` property**.
- `delete (event as any).ignorable` on an object without that own property is a **no-op** — it evaluates to `true` and changes nothing about the object's shape.
- Therefore, in this function, the marker is *never* present at append time, and the `delete` cannot be the reason the append succeeds. The comment's stated causal chain ("the marker would still be there, so delete it, otherwise the reader rejects it") **does not describe this code's real behavior** — there is no marker to delete in the first place.
- `(event as any)` is needed only because `ignorable` is not a property of the inferred literal type. On alpha.2, where the field is back in the host's `SessionEvent` and is not part of the plugin-facing event shape, this cast is also vestigial and should disappear with the line.

Two independent conclusions therefore converge on the same action: the corridor says the workaround expired; the code says it was inert. Either way it must be removed. (The observation that the defense is inert does not retroactively disprove the community's alpha.1 anecdote — an event constructed *elsewhere* with a marker present could have tripped the alpha.1 reader; that path simply is not this one.)

---

## 5. Correct producer semantics on alpha.2

1. **Produce a minimal, plain event.** `{ type: 'third-party/informational', payload }` — `type` plus the plugin's own payload. This is a *third-party* event namespace, not a host `SessionEvent` impersonation.
2. **Do not hand-manage host-internal `SessionEvent` fields.** `ignorable` is a field of the host's own event type, used by the host when it produces events and validated by the host's readers. A third-party producer neither sets nor deletes it. Alpha.2's restored semantics mean the marker, when present, is a legitimate field again — so it must be *preserved* if it exists, and a plugin has no legitimate reason to remove it.
3. **Express semantics through the public API, or not at all.** If alpha.2 offers a supported way to mark a third-party event as ignorable, that is a public-API concern and would be the correct place to use it. The fixture contains no alpha.2 SDK/type sources, so **the existence and exact spelling of such a public knob is unconfirmed** (§8) — but the plugin must not emulate one by mutating the event object.
4. **Do not let a stale comment become the spec.** The removal of `SessionEvent.ignorable` in alpha.1 and its restoration in alpha.2 are *host-side* facts. A plugin comment asserting a reader-side rejection rule for a field version it does not control is exactly the kind of invariant that rots across a corridor.

---

## 6. What an ordinary plugin going through `Session.append(...)` should do

Per the brief's hint — *the public API surface may not even have that parameter* — the ordinary plugin's obligation is simply:

- **Call the public append with a plain event and nothing else.** No retention flag, no `ignorable` property, no extra argument, no `as any` cast, no `delete`.
- **Treat the append signature as the contract.** If alpha.2's `Session.append(...)` does not accept a retention/`ignorable` parameter, then the plugin cannot legitimately request that behavior through it; and if it did accept one, the plugin would use *that* rather than mutating the event object. Either way, **object mutation is not the mechanism.**
- **Keep the plugin's own event self-describing** (`type` + `payload`), and let the host decide storage/retention for third-party events under whatever alpha.2's restored rules are.

---

## 7. Recommended migration change (illustrative — NOT applied)

The fixture is read-only and was left untouched. For the maintainer's real tree, the alpha.2 shape of this function should be:

```ts
export function produceExternalEvent(session: any, payload: any): void {
  const event = { type: 'third-party/informational', payload }
  session.append(event)
}
```

Changes, itemized:

| # | Change | Rationale |
|---|---|---|
| 1 | **Delete** `delete (event as any).ignorable` | Obsolete alpha.1-only workaround; inert in this path; actively harmful where a marker is present (§3, §4) |
| 2 | **Delete/rewrite** the community comment | It asserts a false alpha.1→alpha.2 invariant and instructs the reader to keep the defense; keeping it re-seeds the same trap for the next maintainer |
| 3 | Drop the `as any` cast along with the line | `ignorable` was never a property of this literal; the cast existed only to service the workaround |
| 4 | **Keep** `session.append(event)` unchanged | The plain append is the whole correct producer behavior on alpha.2 |
| 5 | Do **not** add a replacement marker/flag | alpha.2's public `Session.append(...)` surface does not expose one (§6); inventing one would create a new private contract with the host |

No other file in the plugin needs to change for this concern; nothing else in the fixture touches `SessionEvent`.

---

## 8. Explicitly **unconfirmed** items

Per the brief, these could not be verified from the brief and the fixture alone and are **not** guessed at:

1. **The exact alpha.2 `Session.append(...)` signature / parameter list.** The fixture contains no alpha.2 SDK, `d.ts`, or host source; the only usage is `session.append(event)` with `session: any`. The claim that the public surface "may not even have that parameter" is taken from the brief's hint, not from a type declaration in the fixture. *(High confidence it is the right direction; the precise shape is unconfirmed.)*
2. **The exact form of `ignorable` in alpha.2** — e.g. whether it is optional, required, or a different type, and whether it is present on the *plugin-facing* event type or only on host-produced `SessionEvent`. The fixture README says the retention semantics were "restored" but shows no alpha.2 declaration.
3. **The literal content, date, and wording of the DSH-0.1.2-A2-01 changelog entry.** The fixture cites only the change ID and the summary phrase "remove-then-restore".
4. **The pre-alpha.1 baseline's exact treatment of `ignorable`** (verbatim preservation vs. normalization). The baseline is *inferred* from the "remove-then-restore" wording; the fixture does not spell out baseline behavior in detail. This inference is what makes alpha.2's net semantics equal the baseline, and it is the one point where an independent source would strengthen the argument.
5. **The mechanism and identity of the alpha.1 "reader" that allegedly rejected events carrying the marker** (which component, which error, strict-shape validation vs. explicit check). The only source for this is the community comment — a non-authoritative, out-of-date source that the brief tells us not to decide by.
6. **Whether alpha.2's host performs strict rejection of *unknown* extra properties on appended third-party events.** Not exercised by the fixture and not needed for the verdict (the deleted statement touches a property that is absent). It would only matter if the plugin were to *add* a marker, which §7 item 5 forbids.
7. **Whether the fixture's trailing annotation inside the source comment is authoritative fixture content or an evaluation-authored marker.** It is present in the sealed `src/events.ts` and agrees with the fixture README; either way it is fixture material, and the verdict does not rest on it alone (§4 gives an independent basis).

None of the unconfirmed items changes the verdict. The decision is carried by two independent lines of evidence — the corridor account in the fixture README, and the observable no-op nature of the statement in the code itself.

---

## 9. Conclusion

The defense code must be **deleted** in the alpha.2 migration. The alpha.1 removal of `SessionEvent.ignorable` was a transient corridor phase; alpha.2 restored the retention semantics (remove-then-restore), returning the host to the baseline in which third-party producers simply append a plain event. The `delete` line is an expired workaround, and independently it is inert — the object it is applied to has no such property — so it never delivered the protection its comment claims, while encoding a false rule that would mislead the next maintainer and could strip a now-valid field. On alpha.2 the correct producer behavior is to write `{ type, payload }` and call `session.append(event)`, with no marker manipulation and no reliance on a public retention parameter that the append surface does not expose.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.