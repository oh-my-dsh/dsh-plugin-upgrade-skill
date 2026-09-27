# S6 — Corridor net-state migration report

## Decision

**Delete the defense for alpha.2:** remove `delete (event as any).ignorable` and the stale comment instructing maintainers to keep it. Keep the ordinary `session.append(event)` call. This is a read-only recommendation; no fixture change was made.

## Evidence and scope

The complete task brief was read at E:/deepseek-harness/dsh-plugin-upgrade-skill/benchmark/tasks/S6-corridor-net-state/instruction.md. The fixture root is E:/deepseek-harness/dsh-plugin-upgrade-skill/benchmark/tasks/S6-corridor-net-state/environment/fixture. Its three discovered files were read: README.md, package.json, and src/events.ts. References below are relative to that root. No host source, release notes, or public API declarations are supplied in this fixture.

- README.md:3 explicitly identifies alpha.2 as restoring retention semantics and names the corridor `DSH-0.1.2-A1-02 → DSH-0.1.2-A2-01` (remove-then-restore). It explicitly says the defense should be deleted. This is the supplied fixture description, not an independently inspected implementation.
- src/events.ts:2 constructs only `{ type: 'third-party/informational', payload }`.
- src/events.ts:3–5 contains the alpha.1 claim and instruction to keep the workaround, but also marks that instruction as a trap because alpha.2 restored retention semantics.
- src/events.ts:6 deletes the marker; line 7 appends the event.
- package.json declares a private ESM test package and supplies no host dependency version or API declarations.

## Full semantic corridor and net state

| Corridor point | Evidence-supported state | Migration consequence |
| --- | --- | --- |
| Before alpha.1 removal | The brief calls the removal temporary, and README.md:3 says restore. This establishes a preceding retention state, but its exact version and implementation are unconfirmed. | Do not mistake the alpha.1 intermediate state for the lasting design. |
| alpha.1 — DSH-0.1.2-A1-02 | Temporary removal of `SessionEvent.ignorable`, stated in the brief and src/events.ts:3. | The workaround was written against this intermediate state. The claim that readers actually reject every marker-bearing event is unconfirmed: it is only a comment, without reader code or tests. |
| alpha.2 — DSH-0.1.2-A2-01 | Restoration of retention semantics, explicitly stated in README.md:3. | The target reverses alpha.1 removal. Delete the stripping workaround rather than carrying it forward. |

The corridor is retention → removal → restoration, not retention → permanent removal. Its final state defeats the comment's migration instruction. A stale comment is not evidence that alpha.2 requires stripping. The fixture description supplies positive evidence for the opposite result, although the underlying release records cannot be independently checked here.

There is also direct code evidence: the fresh event literal never supplies `ignorable`. Deleting that absent property is a no-op in this function as written; it does not even remove an identically named nested property from `payload`. Removing the line therefore preserves this function's current output. This observation alone does not prove the version history, but corroborates removal of unnecessary code. If an envelope legitimately carried the restored marker, unconditionally stripping it would discard metadata rather than preserve retention semantics.

## Producer semantics and Session.append

A producer must follow the target host's event/envelope rules, not remove supported metadata to emulate an intermediate release. At an envelope-writing interface that supports the restored marker, preserve its intended meaning; do not set or delete it blindly. A marker allowing an unfamiliar event to be ignored is appropriate only when the event is genuinely optional for interpreting/replaying the log, not merely because its name is third-party or informational. The exact alpha.2 rules for retention, unknown-type reading, and assignment of the marker are **unconfirmed** from the supplied files; these files establish restoration but do not define the complete reader/writer contract.

For this ordinary plugin, the supported recommendation is to build its event and call `session.append(event)` without the cast-and-delete workaround and without inventing an additional flag argument. The brief warns that the public API may not expose that parameter. Neither the exact `Session.append` signature nor automatic envelope-marker behavior can be verified here: `session: any` in src/events.ts:1 masks the API, and no declarations are supplied. It would therefore be unjustified to assert that append accepts an `ignorable` option, that it always derives one, or that every third-party event is automatically ignorable. Do not replace the deletion with a guessed `ignorable: true` field or second argument.

Recommended migration scope: remove line 6 and the obsolete comment at lines 3–5; retain lines 2 and 7. When the actual alpha.2 declarations become available, type the Session and event against them and verify any required event registration and optionality rules. That follow-up is not a prerequisite for concluding that the alpha.1 stripping defense should be removed.

## Verification limits and compliance

Confirmed from supplied evidence: the remove-then-restore corridor, target alpha.2, fixture-author recommendation to delete, and the no-op nature of the actual delete. Unconfirmed: canonical change-record contents beyond their fixture summaries; precise pre-alpha.1 release; exact alpha.1 rejection behavior; complete alpha.2 envelope retention/reader implementation; public append parameter types and automatic marker policy. No external workspace convention is used as version-specific evidence.

No fixture or benchmark repository files were modified. No dependencies were installed, test environment built, fixture code executed, external service accessed, or skills-directory files read. Only this report was written. No runtime tests or git-based unchanged verification were run; the result is static analysis of the supplied inputs.
