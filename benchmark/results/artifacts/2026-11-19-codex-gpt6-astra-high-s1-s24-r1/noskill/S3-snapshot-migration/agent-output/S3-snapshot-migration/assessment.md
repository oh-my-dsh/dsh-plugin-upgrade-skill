# Snapshot read-surface migration assessment

Target: dsh 0.1.1-rc.1-era plugin → 0.1.2-alpha.2.
Status: source inventory complete; authoritative migration prescription blocked by missing target API and upgrade-card documentation.

## Scope and evidence

Read only `solver-instruction.md` and all six fixture files. No skills were loaded. No other repository content, sibling cells, previous answers, evaluator material, credentials, memories, or external services were accessed. No install, build, test, migration, or plugin execution was performed. The fixture README explicitly says this trimmed task material cannot be run. All writes are confined to the requested agent-output directory. No fixture file was modified.

Source locations below are relative to `fixture/`, with one-based line numbers.

The fixture contains no 0.1.2-alpha.2 type declarations, compatibility projection implementation, release notes, or upgrade cards. Consequently, absence or replacement of an old API cannot be established simply from its use in old code. The inventory below identifies each migration-sensitive surface, but does not falsely label every one a confirmed breaking change. In particular, an exact new API shape and a full card number such as `DSH-0.1.2-A1-xx` cannot be reconstructed reliably from these files. Invented nested paths, service names, helper imports, or card suffixes would not be a safe migration prescription.

## Snapshot read inventory

| Source | Existing contract | Behavior and migration requirement | Target API / upgrade card |
| --- | --- | --- | --- |
| `src/client/Pet.tsx:8,13` | `ConversationSnapshot` imported from `@deepseek-ai/dsh-client-runtime/client`; helper takes this type | The helper is coupled to the old exported snapshot type. Check the target export and selector input type together; changing only property accesses can leave an incompatible helper signature. | Not supplied; exact target type/import and full card number unverified. |
| `src/client/Pet.tsx:18–20` | `useSession` is injected through slot props; `useSession(s => s.running)` | Reads a scalar execution flag. Identify the target live execution-state selector. Currently `running` is discarded at line 26, but its selector still executes and still requires migration or deliberate removal. | Not supplied; exact selector path and full card number unverified. |
| `src/client/Pet.tsx:13–14,20` | `snapshot.partial?.blocks.some(block => block.kind === 'reasoning') ?? false`, passed as `useSession(isThinking)` | Reads the live partial assistant content, its block collection, and the `kind` discriminant. All three levels need checking. An undefined old `partial` can silently turn this into permanent `false`; optional chaining does not make this semantically compatible. A retained partial with a changed block shape can throw or misclassify. | Not supplied; exact live-content path, block shape, and full card number unverified. |
| `src/client/Pet.tsx:21` | `useSession(s => s.runningCalls.length > 0)` | Reads currently executing tools, not merely historical tool-call records. If the collection is removed, `.length` throws. Replacement must preserve in-flight semantics, including concurrent calls and terminal transitions. | Not supplied; exact active-call read API and full card number unverified. |
| `src/client/Pet.tsx:22–23` | `useSession(s => s.turnEnds[s.turnEnds.length - 1]?.reason)` | Reads ordered completed-turn boundaries and the last end reason. Both accesses to `turnEnds` need migration. The optional access guards a missing final item, not a missing collection. A replacement must preserve completion ordering, empty-history behavior, and reason semantics. Currently discarded at line 27, but still executed. | Not supplied; exact turn-history/timeline read API and full card number unverified. |

These are all snapshot properties actually read in the supplied code: `running`, `partial.blocks[*].kind`, `runningCalls.length`, and `turnEnds[*].reason`. No message-list, permission, token-usage, or other snapshot reads occur here.

`Pet.tsx:29–30` consumes the derived values with tool activity taking precedence over reasoning activity. Preserve that priority when changing the source of each selector. The helper comment says “with no tool in flight,” but the helper itself only checks reasoning; tool precedence is implemented in the effect.

## Integration surfaces requiring target-contract review

These are separate from the four snapshot selectors and must not be skipped merely because the task is framed around snapshots.

| Source | Existing exact shape | Required review |
| --- | --- | --- |
| `package.json:6–8` | `client: { platform: 'web', inject: ['dsh-client-runtime', 'dsh-client-ui-conversation', 'dsh-client-locale'] }` | Verify target browser entry metadata, plugin dependency identifiers, and their ordering requirements. No evidence here establishes these as unchanged or removed. |
| `src/client/index.ts:6,35,38` | `ClientContext` from `@deepseek-ai/dsh-client-runtime/client` | Check the target context type/export and the callback scope type. |
| `src/client/index.ts:7–10` | Type-only augmentation imports from locale and ui-conversation `/client` entry points | Verify the target packages and augmentation owners. Type-only imports are intentional, not runtime service initialization. |
| `src/client/index.ts:14–19` | `declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap { pet: PetKey } }` | Verify where the locale namespace map is declared in the target and its key/value contract. A moved augmentation must be applied to its actual owner. |
| `src/client/Pet.tsx:7,10,18` | `PropsRuntime<'conversation.session.header.actions'> & PropsLocale<'pet'>`; destructured `useSession, t` | Check target prop helpers, their export owner, slot type arguments, and injected hook/translator names. Type casts cannot restore removed runtime props. |
| `src/client/index.ts:29,38` | `export const inject = ['slots', 'conversation', 'locale']`; `ctx.inject(['slots', 'conversation'], callback)` | Check target service keys and preserve slot-declaration ordering. Lines 25–27 explicitly document that registering into an undeclared slot throws. |
| `src/client/index.ts:36` | `ctx.effect(() => ctx.locale.register('pet', { zh, en }), 'pet: dictionaries')` | Check target locale registration signature and disposal contract. Preserve dictionary registration and teardown. |
| `src/client/index.ts:39–42` | `scope.slots.register({ name: 'conversation.session.header.actions', id: 'pet', order: 10 }, Pet)` | Check target slot name, registration signature, prop contract, and lifecycle. A retained string alone does not prove that its props remain compatible. |

Exact replacement declarations and corresponding full upgrade-card identifiers for these integration surfaces are also unavailable in the permitted material. `cordis.patch.yml:1–3` only inserts this plugin by id/name; `locales.ts:2–4` defines local keys and dictionaries. Neither provides a target API contract or independently demonstrates a migration break.

## Compatibility projection versus immediate new reads

A compatibility projection can only support a consumer when its documented output contains that consumer's old fields with equivalent semantics. It cannot reconstruct omitted execution state or completed-turn history by casting the new object to the old type.

The following is a decision checklist, not a claim that the target ships these projection fields:

- `running`: eligible for a temporary projection only if it explicitly projects the old execution boolean. Otherwise migrate this selector immediately.
- `partial`, its `blocks`, and `kind === 'reasoning'`: eligible only if the projection preserves live partial content, block shape, and the reasoning discriminant. A projection of persisted messages alone is insufficient.
- `runningCalls`: eligible only if the projection explicitly includes active tool execution state. Persisted call records cannot substitute for “currently running.” Without that guarantee this must use the new execution read path immediately.
- `turnEnds` and `reason`: eligible only if the projection explicitly supplies ordered completed-turn end records and their reasons. A current-state snapshot or a message projection cannot be assumed to contain historical turn boundaries. Without that guarantee this must switch to the new turn-history read path immediately.

There is no compatibility projection declaration in this fixture. Therefore **no field can be certified projection-safe from the supplied evidence**, and the requested definitive division between projection-supported fields and immediately migrated fields remains blocked. Defaulting missing collections to `[]` or missing flags to `false` would hide loss of activity/history rather than restore compatibility.

## Concrete next migration steps once the missing contract is available

1. Obtain the 0.1.2-alpha.2 read-surface declarations and the applicable upgrade cards, including changes in intermediate prereleases. Map every inventory row to its actual full card number.
2. Resolve the browser service, slot, locale, and prop contracts first so the component receives supported hooks and types.
3. Establish the projection's exact input/output and supported fields. Use it only for documented transitional consumers; do not retain a whole-object assertion to `ConversationSnapshot`.
4. Implement the live execution, reasoning, tool activity, and completed-turn selectors against their documented owners. Specify the exact typed replacement for each old expression above before editing code.
5. Validate empty/idle, reasoning-only, tool execution, simultaneous reasoning and tools, completion, and session-switch behavior. Confirm that terminal or prior-session activity does not persist. No such validation was run in this read-only assessment.

A pre-existing animation concern is separate from migration: `Pet.tsx:28–31` changes a ref inside an effect, which does not itself schedule rendering, so the DOM frame can lag the selected state. Also the introductory celebration behavior is not implemented: `lastTurnEnd` is discarded. These are not proven 0.1.2-alpha.2 breaking changes and should not be assigned upgrade cards without evidence.

## Completion limits

Delivered: full source inventory of old snapshot reads and related integration contracts, expected behavior, failure modes, and a constrained migration checklist. Not delivered as verified facts: target API spellings, confirmed exhaustive breakage against target code, full upgrade-card mappings, or the target projection's actual supported-field split. The blocker is missing authoritative target documentation within the allowed evidence, not missing user confirmation.
