# S6: alpha.2 corridor net-state migration report

## Decision

**Delete the marker-deletion defense and replace its misleading comment in a future implementation.** This is a recommendation only; the fixture remains unchanged. Do not interpret removal of that line as a complete migration: the ordinary alpha.2 public append API cannot produce the required omission-safety marker for an unknown third-party event.

`fixture/src/events.ts:1–8` creates `{ type: 'third-party/informational', payload }`, deletes `(event as any).ignorable` at line 6, and calls `session.append(event)` at line 7. The literal contains no marker, so the deletion is currently a no-op. It would destroy useful omission-safety metadata if a marker-bearing envelope reached it. The function's `any` parameter also conceals API shape errors: the documented alpha.2 public API accepts type, data, and (for surface events only) SurfaceIntent, rather than establishing this object-form call as valid. Whether the supplied object is actually an adapter exposing a different append signature is **unconfirmed**; no implementation is provided.

## Evidence and complete relevant history

The version-card metadata connects `dsh-v0.1.1-rc.2 → dsh-v0.1.2-alpha.1 → dsh-v0.1.2-alpha.2`. The plugin's own version is separately `dsh-events-bench@0.1.0`; it is not the host corridor.

1. Before alpha.1, the marker existed. This is supported by the removal/restoration history in the supplied cards; exact earlier introduction and independent rc.2 implementation behavior are **unconfirmed** here.
2. **DSH-0.1.2-A1-02**, `references/v0.1.2-alpha.1.md:112–121`: alpha.1 temporarily removed preservation of `SessionEvent.ignorable`. Unknown persisted events consequently appeared required and readers rejected reload. Its action level explicitly applies only when the target is alpha.1. The safe alpha.1 response was to stop persisting unknown events or use genuinely equivalent known public vocabulary—not delete a marker or whitelist events at the reader. Thus the comment's proposed defense did not address the underlying failure even for alpha.1.
3. **DSH-0.1.2-A2-01**, `references/v0.1.2-alpha.2.md:34–43`: alpha.2 restores retention through the envelope, persistence, reload, and transport. Adapters continuing to drop the marker can cause first-party readers to reject Sessions with unknown events. The final net state is restored retention, not permanent removal. Do not mechanically apply the intermediate removal and then re-add it.
4. **API-05**, `references/api-migration-0.1.2-alpha.2.md:411–449`, distinguishes that restoration from producer API availability. `ignorable?: true` is restored on the envelope, but public `Session.append()` does not accept/persist it. A successful live custom append can lead to `SessionFormatUnsupportedError` on cold load and refusal of the whole Session.

These are supplied local reference findings, independent of the fixture comment. The references cite exact-tag Session types, append implementation, persistence coordinator, and restoration decision. Those upstream targets were not fetched or independently executed under this task's no-network/no-reproduction scope.

## Correct producer and reader semantics

An owner of a supported envelope/persistence seam should set **`ignorable: true` only for auxiliary informational events whose omitted interpretation cannot affect correct Session reconstruction or durable/core semantics**. An event name containing “informational” is insufficient proof; the payload and consumers here are unspecified, so this particular event's omission safety is **unconfirmed**.

Preserve the marker unchanged through JSONL, SQLite, API transports, reload, and the generated catalog wherever those layers apply. Unknown marked events remain in the loaded event sequence; a reader unfamiliar with their type may omit interpreting their semantics. The marker is not an instruction to filter or delete events. Unknown events without the marker remain required-on-read and must fail closed. Do not broadly mark required events ignorable to force compatibility.

For this ordinary plugin, do not “fix” the code by adding an `ignorable` property to the object, adding an invented append option, casting, mutating/thawing appended events, hand-editing JSONL, or registering an event name alone. None establishes a supported alpha.2 producer seam. Stop persisting this unknown custom event through public Session.append and use a **plugin-owned sidecar/store keyed by Session id**. A known event may be reused only for identical real semantics; do not disguise plugin state as core or model-visible events. Revisit custom persistent events only when a formal producer/registration API actually persists the marker and supports compatibility independent of active plugin composition.

## Completed

Read the plugin-upgrade skill, corridor index, pre-flight guidance, relevant alpha.1/alpha.2 cards, and API-05. Inspected every supplied fixture file read-only. The fixture comprises package.json, README.md, and src/events.ts; package metadata is private ESM with no declared dependencies or scripts. Identified touchpoint #2 (persistent event production); no imports or declarations establish a typed DSH integration. Produced this report under the explicitly authorized output directory. No fixture edits, installs, builds, migrations, network access, or runtime experiments were performed.

## Skipped and pre-existing

Pre-existing baseline failures: **not collected**, because this is a read-only report rather than an implementation exercise. No source patches, service/Remote integration, host filesystem operations, UI/commands/tools, custom channels, or subprocess/output handling appear in the supplied implementation. Runtime boot, cold-load testing, packaging, and dependency upgrades were outside scope. SQLite schema migration is not a demonstrated fixture hit; if that provider is later found in the actual deployment, A2-01 separately requires schema 20 and rejects schema 19 without automatic migration.

## Pending / residual risk and validation plan

Actual installed host/package cohort, dependency resolution, installation track, Git identity/working-tree baseline, Node version, runtime activation, concrete session type, payload semantics, and observed cold-load behavior are **unconfirmed** from these fixture files. This report does not certify a successful migration or working public append call.

Future authorized validation should use exact alpha.2 declarations to check the producer signature and a real persist → process restart → cold-load sequence. A live append alone is insufficient. For a persistence owner, verify unknown marked envelopes survive reload unchanged and remain in loaded events, while unknown unmarked required events explicitly refuse restoration. For the sidecar approach, verify state survives restart keyed to the correct Session without introducing unknown Session log events. No such tests were run here.

## Rollback and recommendation

No fixture or deployment state was changed, so no migration rollback is necessary. Only this report was created. A later implementation should capture its own source/configuration baseline, remove the stale defense/comment, and resolve the producer capability gap as described above; removing line 6 alone is not completion.
