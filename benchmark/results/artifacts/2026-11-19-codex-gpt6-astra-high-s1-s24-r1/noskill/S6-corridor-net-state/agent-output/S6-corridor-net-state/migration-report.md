# S6 migration report: alpha.2 event semantics

## Decision

Delete the alpha.1 defense `delete (event as any).ignorable` when migrating to alpha.2, and remove or correct the accompanying claim that this deletion must be retained. This is a recommendation only; no fixture file was modified.

The evidence is the supplied `fixture/README.md`, which explicitly identifies the corridor as **DSH-0.1.2-A1-02 → DSH-0.1.2-A2-01**, removal followed by restoration of retention semantics. A workaround inferred solely from the intermediate alpha.1 state does not describe the target alpha.2 contract. The source comment is not evidence that alpha.2 readers reject marked events.

## Corridor and net effect

| Stage | Supplied evidence and consequence |
| --- | --- |
| Before alpha.1 | The brief describes alpha.1 as temporarily removing `SessionEvent.ignorable`; the README calls alpha.2 a restoration. Together these imply the marker semantics existed before the removal. The exact earlier version and original declaration are **unconfirmed**. |
| alpha.1, DSH-0.1.2-A1-02 | The brief and fixture identify removal of `SessionEvent.ignorable`. The code deletes the property as a defensive adaptation. Whether alpha.1 readers actually rejected any event carrying it is **unconfirmed**: no reader implementation or executable evidence is supplied. |
| alpha.2, DSH-0.1.2-A2-01 | The README explicitly states restoration of retention semantics and says to delete this defense. Therefore the target net state restores the earlier behavior; it is not the alpha.1 removal state. Exact host declarations and runtime implementation are **unconfirmed**. |

## Producer semantics and ordinary plugins

At the persisted-event producer boundary, preserve the target host's `ignorable` semantics instead of stripping the marker. For a third-party informational event that a reader may safely skip when it does not understand the event type, the intended representation is an ignorable event (`ignorable: true`), rather than an event made implicitly mandatory by deleting that information. Do not indiscriminately label events ignorable when skipping them would break required state reconstruction. The detailed rules for unknown-event handling, marker defaults, and the precise scope of the retention guarantee are **unconfirmed** from the supplied files; the README states restoration but supplies no host schema or implementation.

An ordinary plugin should use the supported `Session.append(...)` interface and leave persisted envelope construction and marker handling to the host where the host owns them. Do not add an undocumented argument or force the property through `any`. If the public append surface has no `ignorable` parameter, the plugin should not try to supply one; correct marking belongs in the host's persistence producer. The exact public append signature, whether it accepts this event-object form, whether it has any marker parameter, and whether alpha.2 automatically marks plugin events are all **unconfirmed** here. The task's hint is not a substitute for the missing API declaration.

For this fixture, the concrete recommended source change is to remove the deletion and its obsolete explanatory comment, retaining the existing append call pending validation against the actual alpha.2 public API. This report does not propose adding `ignorable` directly to the argument passed to append.

## What the code actually demonstrates

`fixture/src/events.ts` constructs a fresh object with only `type` and `payload`, deletes its absent `ignorable` property, and then calls `session.append(event)`. Consequently the deletion is currently a no-op in this function. Its removal cleans up an obsolete and misleading policy; it does not by itself prove a change to serialized output. If a later producer supplies the marker, the same deletion would actively discard it.

Both `session` and `payload` are typed `any`, and the deletion uses another `any` cast. These types provide no evidence of the supported host contract. `fixture/package.json` declares no dependencies, host version, scripts, or API types. No host source, release-note text, persisted samples, or reader behavior is available for independent corroboration.

## Evidence limits and execution

Read only the supplied solver instruction and the three fixture files: `README.md`, `package.json`, and `src/events.ts`. No skills, network, external references, tests, builds, installations, reproduction environment, scoring tools, or other repository material were used. The remove-then-restore decision is supported by the fixture's explicit account, not independently verified against upstream releases. Missing alpha.2 API and runtime evidence limits verification but does not block the requested read-only recommendation. All writes were confined to the designated agent-output directory; the fixture was left unchanged.
