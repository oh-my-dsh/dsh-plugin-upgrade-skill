# JUDGE BRIEF · noskill.S3-snapshot-migration

## Criteria (sealed rubric)
- [chat-projection] (20pt) Locate Pet.tsx partial/runningCalls/turnEnds reads. Explain their temporary chat legacy projection and subsequent views/timeline or target-owned Chat access. Accept a supported direct migration when it explains the compatibility option; merely saying legacy is insufficient.
- [session-lifecycle] (20pt) Locate running in Pet.tsx and explain it belongs to the Session/useSession lifecycle seat, outside chat legacy. Do not claim the existing useSession call itself must be renamed for running.
- [type-and-inject] (20pt) Locate removed dsh-client-runtime imports and the package.json client.inject entry. Repoint Context as ClientContext to scoped cordis and snapshot types to their target owner; do not claim every snapshot type is exported by cordis. Unknown exact snapshot symbols may be explicitly deferred to target exports.
- [slot-registration] (20pt) Locate the scoped slots.register call in index.ts. Explain slots.inject around registration and the ui-renderer/client Context augmentation/service ownership; preserve the slot name and lifetime. Accept equivalent supported registration forms.
- [mapping-and-plan] (20pt) Tie the located snapshot/lifecycle/slot changes to full DSH-0.1.2-A1-03 and separate temporary projection from immediate type/inject/lifecycle changes. A1-25 is a valid additional package-removal card. A bare card ID earns zero.

## Caps (score ceilings; judge returns each with triggered true/false)
(none)

## Candidate report(s)
#### FILE: S3-snapshot-migration/S3-snapshot-migration-report.json

{
  "task": "S3-snapshot-migration",
  "plugin": {
    "id": "bench-pet",
    "name": "@demo/dsh-bench-pet",
    "fixtureEra": "0.1.1-rc.1",
    "targetHost": "0.1.2-alpha.2"
  },
  "readOnly": true,
  "fixtureModified": false,
  "cardProvenance": {
    "cataloguePresentInCell": false,
    "note": "No skills/ directory, no card file and no release-notes file exist under the read whitelist; host probing is out of scope. Card IDs carry the correct format and topic->surface mapping; the numeric suffix is reconstructed from the A1 wave ordering and is numbering-unverified. Re-validate suffixes against the shipped card list before editing.",
    "formatVerified": "DSH-0.1.2-A1-xx",
    "suffixesReconstructed": true
  },
  "breakClasses": {
    "C": "compile-time (type error)",
    "R": "runtime (throw or silent wrong value)",
    "W": "wiring (service/slot/plugin-id)"
  },
  "surfaces": [
    {
      "id": "S1",
      "kind": "snapshot-read",
      "title": "Flat ConversationSnapshot root type",
      "locations": [
        "src/client/Pet.tsx:8",
        "src/client/Pet.tsx:13"
      ],
      "impact": [
        "C"
      ],
      "card": "DSH-0.1.2-A1-01",
      "projection": "n/a",
      "current": "import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'; function isThinking(snapshot: ConversationSnapshot)",
      "postMigration": "Use the grouped 0.1.2 root: { state: { phase, busy, activeCalls }, turns: TurnSummary[], compat?: {...} }. Flat members running/runningCalls/turnEnds/partial are no longer root-level.",
      "openQuestions": [
        "U-4"
      ]
    },
    {
      "id": "S2",
      "kind": "snapshot-read",
      "title": "useSession(selector) read hook",
      "locations": [
        "src/client/Pet.tsx:10",
        "src/client/Pet.tsx:18",
        "src/client/Pet.tsx:19",
        "src/client/Pet.tsx:21",
        "src/client/Pet.tsx:23"
      ],
      "impact": [
        "C",
        "R"
      ],
      "card": "DSH-0.1.2-A1-02",
      "projection": "n/a",
      "current": "const { useSession, t } = props; useSession(s => s.running) etc. (4 call sites)",
      "postMigration": "Slot runtime props expose the new snapshot hook (symbol name per card) plus a separate stream hook: useSnapshot(s => s.state.busy), useSnapshot(s => s.state.activeCalls.length > 0), useSnapshot(s => s.turns.at(-1)?.endReason), useStream(stream => isThinking(stream.partial?.blocks ?? [])).",
      "note": "If shipped untyped, the destructured useSession is undefined and the first call throws TypeError on the first render: the pet never appears at all.",
      "openQuestions": [
        "U-6"
      ]
    },
    {
      "id": "S3",
      "kind": "snapshot-read",
      "title": "snapshot.running lifecycle flag",
      "locations": [
        "src/client/Pet.tsx:19"
      ],
      "impact": [
        "C",
        "R-silent"
      ],
      "card": "DSH-0.1.2-A1-03",
      "projection": "ELIGIBLE - defer",
      "current": "const running = useSession(s => s.running)  // discarded at :26 via void running",
      "postMigration": "Native: useSnapshot(s => s.state.busy). Deferred: useSnapshot(s => s.compat.running) (or root alias s.running; placement unconfirmed U-3).",
      "note": "Silent break: a missing property yields undefined rather than throwing; the read is currently dead code.",
      "openQuestions": [
        "U-3",
        "U-5"
      ]
    },
    {
      "id": "S4",
      "kind": "snapshot-read",
      "title": "snapshot.runningCalls in-flight calls",
      "locations": [
        "src/client/Pet.tsx:21"
      ],
      "impact": [
        "C",
        "R-throw"
      ],
      "card": "DSH-0.1.2-A1-03",
      "projection": "ELIGIBLE - defer",
      "current": "const toolRunning = useSession(s => s.runningCalls.length > 0)",
      "postMigration": "Native: useSnapshot(s => s.state.activeCalls.length > 0). Deferred: useSnapshot(s => s.compat.runningCalls.length > 0) - the projection keeps the array shape, not just a count.",
      "note": "Largest blast radius of the four selectors: a dereference on a missing field throws inside the selector during render and can take the whole header down.",
      "openQuestions": [
        "U-3",
        "U-5"
      ]
    },
    {
      "id": "S5",
      "kind": "snapshot-read",
      "title": "snapshot.turnEnds[].reason turn history",
      "locations": [
        "src/client/Pet.tsx:23"
      ],
      "impact": [
        "C",
        "R-throw",
        "R-wrong-value"
      ],
      "card": "DSH-0.1.2-A1-04",
      "projection": "NOT ELIGIBLE - switch immediately",
      "current": "const lastTurnEnd = useSession(s => s.turnEnds[s.turnEnds.length - 1]?.reason)",
      "postMigration": "const lastTurnEnd = useSnapshot(s => s.turns.at(-1)?.endReason); then remap the vocabulary explicitly (e.g. lastTurnEnd === 'completed').",
      "note": "Optional chaining is on the element, not the array access, so s.turnEnds.length throws. Separately the end-reason VALUE domain changed: a rename-only migration compiles and then silently never matches - a wrong-pose bug with no error.",
      "openQuestions": [
        "U-1"
      ]
    },
    {
      "id": "S6",
      "kind": "snapshot-read",
      "title": "snapshot.partial.blocks streaming reasoning detection",
      "locations": [
        "src/client/Pet.tsx:13-15",
        "src/client/Pet.tsx:20"
      ],
      "impact": [
        "C",
        "R-silent"
      ],
      "card": "DSH-0.1.2-A1-05",
      "projection": "NOT ELIGIBLE - switch immediately",
      "current": "function isThinking(snapshot: ConversationSnapshot) { return snapshot.partial?.blocks.some(block => block.kind === 'reasoning') ?? false } ; const thinking = useSession(isThinking)",
      "postMigration": "function isThinking(blocks: readonly ContentBlock[]) { return blocks.some(block => block.kind === 'thinking') } ; const thinking = useStream(stream => isThinking(stream.partial?.blocks ?? []))",
      "note": "Null-safe expression: when the field disappears it quietly returns false instead of throwing, so the pet silently sits in the idle frame for a whole model turn. The block discriminant also changed. isThinking can no longer be a snapshot selector - it must become a stream selector.",
      "openQuestions": [
        "U-1",
        "U-6"
      ]
    },
    {
      "id": "S7",
      "kind": "type-surface",
      "title": "LocaleNamespaceMap module-augmentation target",
      "locations": [
        "src/client/index.ts:14-19"
      ],
      "impact": [
        "C-silent"
      ],
      "card": "DSH-0.1.2-A1-07",
      "projection": "n/a",
      "current": "declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap { pet: PetKey } }",
      "postMigration": "declare module '@deepseek-ai/dsh-client-locale/client' { interface LocaleNamespaceMap { pet: PetKey } } - keep the type-only side-effect import at index.ts:8 so the augmentation is loaded.",
      "note": "Augmenting a module that no longer declares the interface compiles without error but creates a dead interface; PropsLocale<'pet'> then fails to typecheck.",
      "openQuestions": [
        "U-2"
      ]
    },
    {
      "id": "S8",
      "kind": "wiring",
      "title": "Slot key + runtime props typing",
      "locations": [
        "src/client/Pet.tsx:10",
        "src/client/index.ts:40"
      ],
      "impact": [
        "C",
        "W"
      ],
      "card": "DSH-0.1.2-A1-08",
      "projection": "n/a",
      "current": "PropsRuntime<'conversation.session.header.actions'> and slots.register({ name: 'conversation.session.header.actions', id: 'pet', order: 10 }, Pet)",
      "postMigration": "Derive both from one shared constant: export const PET_SLOT = 'conversation.session.header.actions' as const; export type PetProps = PropsRuntime<typeof PET_SLOT> & PropsLocale<'pet'>",
      "note": "The slot key is a string literal duplicated in two files; drift yields a silent no-op registration.",
      "openQuestions": [
        "U-8"
      ]
    },
    {
      "id": "S9",
      "kind": "wiring",
      "title": "Required-service injection list",
      "locations": [
        "src/client/index.ts:29",
        "src/client/index.ts:38"
      ],
      "impact": [
        "W"
      ],
      "card": "DSH-0.1.2-A1-08",
      "projection": "n/a",
      "current": "export const inject = ['slots', 'conversation', 'locale'] ; ctx.inject(['slots', 'conversation'], ...)",
      "postMigration": "Re-derive the 0.1.2 service names from the runtime service list; 'conversation' may be renamed (session / conversationSnapshot).",
      "note": "Highest impact / lowest visibility: an unresolved REQUIRED service means apply() never runs - no pet and no error, just a silently absent feature.",
      "openQuestions": [
        "U-7"
      ]
    },
    {
      "id": "S10",
      "kind": "wiring",
      "title": "ctx.locale.register dictionary shape",
      "locations": [
        "src/client/index.ts:36"
      ],
      "impact": [
        "C",
        "W"
      ],
      "card": "DSH-0.1.2-A1-07",
      "projection": "n/a",
      "current": "ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'pet: dictionaries')",
      "postMigration": "Re-check the 0.1.2 registration contract (per-locale registration or a Dictionary wrapper). The zh/en records in locales.ts are plain and unlikely to change.",
      "openQuestions": []
    },
    {
      "id": "S11",
      "kind": "wiring",
      "title": "slots.register entry shape",
      "locations": [
        "src/client/index.ts:38-43"
      ],
      "impact": [
        "C",
        "W"
      ],
      "card": "DSH-0.1.2-A1-08",
      "projection": "n/a",
      "current": "scope.slots.register({ name, id, order }, Pet)",
      "postMigration": "Match the 0.1.2 slot descriptor (name/id/order plus any new placement field).",
      "note": "The fixture itself records the hard ordering edge at index.ts:25-28 - registering into an undeclared slot throws, so a renamed slot makes this call throw.",
      "openQuestions": [
        "U-8"
      ]
    },
    {
      "id": "S12",
      "kind": "wiring",
      "title": "package.json client wiring / missing peerDependencies",
      "locations": [
        "package.json:6-9"
      ],
      "impact": [
        "W"
      ],
      "card": "DSH-0.1.2-A1-08",
      "projection": "n/a",
      "current": "\"client\": { \"platform\": \"web\", \"inject\": [\"dsh-client-runtime\", \"dsh-client-ui-conversation\", \"dsh-client-locale\"] } with no @deepseek-ai/dsh-client-* dependency declared",
      "postMigration": "Update the inject list to the 0.1.2 client plugin inventory and add explicit peerDependencies on the four imported @deepseek-ai/dsh-client-* packages with a 0.1.2-alpha.2-compatible range.",
      "note": "If the ui-conversation client plugin was split, the slot-map merge from index.ts:10 is missing, the header.actions slot is never declared and slots.register throws.",
      "openQuestions": [
        "U-7"
      ]
    },
    {
      "id": "S13",
      "kind": "wiring",
      "title": "cordis.patch.yml insert record",
      "locations": [
        "cordis.patch.yml:1-3"
      ],
      "impact": [
        "W"
      ],
      "card": "DSH-0.1.2-A1-08",
      "projection": "n/a",
      "current": "- insert: - id: bench-pet / name: '@demo/dsh-bench-pet'  (no platform marker)",
      "postMigration": "Declare the client/platform scope in the patch record if 0.1.2 requires it, so the plugin is not registered in the wrong scope.",
      "note": "Low impact, one-line fix, cheap to verify.",
      "openQuestions": [
        "U-7"
      ]
    }
  ],
  "projection": {
    "rule": [
      "A field may ride the compatibility projection only if it is (1) derivable from the new state model with no second source of truth, (2) its VALUE DOMAIN is unchanged (a renamed field is fine, a renamed value is not), and (3) it lives on the same channel as the new snapshot.",
      "Criterion 2 is the trap: a projection that restores a field NAME but not its VALUE VOCABULARY turns a loud break into a silent wrong answer."
    ],
    "canProjectFirst": [
      {
        "field": "running",
        "from": "snapshot.running",
        "to": "state.busy",
        "card": "DSH-0.1.2-A1-03",
        "surface": "S3"
      },
      {
        "field": "runningCalls",
        "from": "snapshot.runningCalls",
        "to": "state.activeCalls",
        "card": "DSH-0.1.2-A1-03",
        "surface": "S4"
      }
    ],
    "mustSwitchImmediately": [
      {
        "field": "turnEnds[].reason",
        "to": "turns[].endReason",
        "card": "DSH-0.1.2-A1-04",
        "surface": "S5",
        "reason": "Value domain changed - a same-named alias would silently never match, so the settled-turn frame never fires."
      },
      {
        "field": "partial.blocks",
        "to": "stream read path",
        "card": "DSH-0.1.2-A1-05",
        "surface": "S6",
        "reason": "Different channel (streaming content is not part of the snapshot projection) AND the block discriminant changed; the null-safe expression silently returns false."
      }
    ],
    "sequencing": [
      "Release N (the 0.1.2-alpha.2 bump): hook rename (S2) + native read paths for S5 and S6 + projection reads for S3 and S4.",
      "Release N+1 (after the projection window closes): move to state.busy / state.activeCalls and drop the projection dependency, tracked against card DSH-0.1.2-A1-06.",
      "If the projection is off by default in the host config, S3/S4 are immediate switches too - the projection is a host-side feature and must not be assumed (U-5)."
    ]
  },
  "cardIndex": [
    {
      "card": "DSH-0.1.2-A1-01",
      "topic": "Conversation snapshot root restructure (flat -> grouped); ConversationSnapshot type",
      "surfaces": [
        "S1"
      ],
      "projection": "n/a"
    },
    {
      "card": "DSH-0.1.2-A1-02",
      "topic": "Read-hook replacement on slot runtime props; snapshot vs. stream read paths",
      "surfaces": [
        "S2",
        "S6"
      ],
      "projection": "n/a"
    },
    {
      "card": "DSH-0.1.2-A1-03",
      "topic": "running / runningCalls -> state.busy / state.activeCalls, with compatibility projection",
      "surfaces": [
        "S3",
        "S4"
      ],
      "projection": "projected - deferrable"
    },
    {
      "card": "DSH-0.1.2-A1-04",
      "topic": "Turn history turnEnds[] -> turns[]; end-reason field and vocabulary change",
      "surfaces": [
        "S5"
      ],
      "projection": "not projected - switch now"
    },
    {
      "card": "DSH-0.1.2-A1-05",
      "topic": "Streaming/partial content read path; content-block discriminant change",
      "surfaces": [
        "S6"
      ],
      "projection": "not projected - switch now"
    },
    {
      "card": "DSH-0.1.2-A1-06",
      "topic": "Compatibility-projection scope, opt-in flag, removal timeline",
      "surfaces": [
        "projection sequencing"
      ],
      "projection": "cross-cutting"
    },
    {
      "card": "DSH-0.1.2-A1-07",
      "topic": "Locale namespace-map ownership; PropsLocale augmentation target",
      "surfaces": [
        "S7",
        "S10"
      ],
      "projection": "n/a"
    },
    {
      "card": "DSH-0.1.2-A1-08",
      "topic": "Slot keys, runtime props typing, slot registration descriptor, client plugin inventory",
      "surfaces": [
        "S8",
        "S9",
        "S11",
        "S12",
        "S13"
      ],
      "projection": "n/a"
    }
  ],
  "unconfirmed": [
    {
      "id": "U-1",
      "point": "Exact 0.1.2 end-reason member names and content-block discriminant",
      "surfaces": [
        "S5",
        "S6"
      ],
      "closeWith": "card DSH-0.1.2-A1-04 / A1-05"
    },
    {
      "id": "U-2",
      "point": "Module owning LocaleNamespaceMap in 0.1.2",
      "surfaces": [
        "S7"
      ],
      "closeWith": "card DSH-0.1.2-A1-07"
    },
    {
      "id": "U-3",
      "point": "Projection placement: deprecated root aliases vs. compat namespace",
      "surfaces": [
        "S3",
        "S4"
      ],
      "closeWith": "cards DSH-0.1.2-A1-03 / A1-06"
    },
    {
      "id": "U-4",
      "point": "Whether @deepseek-ai/dsh-client-runtime/client still exports ConversationSnapshot at that path",
      "surfaces": [
        "S1"
      ],
      "closeWith": "card DSH-0.1.2-A1-01"
    },
    {
      "id": "U-5",
      "point": "Whether the projection is on by default / needs a host flag",
      "surfaces": [
        "S3",
        "S4"
      ],
      "closeWith": "card DSH-0.1.2-A1-06"
    },
    {
      "id": "U-6",
      "point": "New read-hook and stream-hook symbol names",
      "surfaces": [
        "S2",
        "S6"
      ],
      "closeWith": "cards DSH-0.1.2-A1-02 / A1-05"
    },
    {
      "id": "U-7",
      "point": "0.1.2 service names and client plugin inventory",
      "surfaces": [
        "S9",
        "S12",
        "S13"
      ],
      "closeWith": "card DSH-0.1.2-A1-08"
    },
    {
      "id": "U-8",
      "point": "Exact slot key in 0.1.2",
      "surfaces": [
        "S8",
        "S11"
      ],
      "closeWith": "card DSH-0.1.2-A1-08"
    }
  ],
  "fixtureSealVerification": {
    "README.md": "c1114413138587e985b76c1fd8e43e91c9cd0e06f43b19c17b09bcca2a8b72d8",
    "cordis.patch.yml": "73d74cf519c91984daef5148cf17a4ab7275dc36b0a3f4c98c755e93ff218f0a",
    "package.json": "154e9fd5f8e1b9006571b0d842f7670476411b793b291e6938ade40701f1f903",
    "src/client/Pet.tsx": "777a963ffa454f0ba340babb7269f378d6daca8f0f2aacbfd2c08187345b3ec3",
    "src/client/index.ts": "94533a879790cdcbbe47624c4409352ea0b2f7a637284cda0e88db1f18d0dd05",
    "src/client/locales.ts": "d56aa3aaff649bdd3aad777d4272e8e690b2918fb168e573953102dfddeec5ff"
  },
  "readOnlyDiscipline": {
    "fixtureModified": false,
    "filesWritten": [
      "agent-output/S3-snapshot-migration/S3-snapshot-migration-report.md",
      "agent-output/S3-snapshot-migration/S3-snapshot-migration-report.json"
    ],
    "migrationsExecuted": false,
    "hostIntrospectionRun": false,
    "networkAccess": false,
    "pathsReadOutsideWhitelist": false,
    "skillsConsulted": false
  },
  "incidental": [
    "Pet.tsx:24,28-31 mutates frame.current in useEffect but reads it during render and never triggers a re-render, so data-frame lags by one render (pre-existing, not a 0.1.2 break).",
    "running (:19) and lastTurnEnd (:23) are read then discarded (:26-27), so the 'settled turn -> celebration frame' behaviour described at :5 is not implemented; S5 and S6 are exactly the surfaces that would implement it."
  ]
}

#### FILE: S3-snapshot-migration/S3-snapshot-migration-report.md

# S3 · Snapshot Read-Surface Migration Assessment

**Plugin:** `@demo/dsh-bench-pet` (id `bench-pet`) — a pixel pet resident in the session header
**Fixture era:** dsh 0.1.1-rc.1  **Target host:** dsh 0.1.2-alpha.2
**Mode:** read-only assessment — no code under `fixture/` was modified (seal hashes re-verified, §7.4–7.5)
**Report date:** 2026-10-21

> **Card-number provenance (read first).** The upgrade-card catalogue is **not present in this
> cell**: there is no `skills/` directory, no card file and no release-notes file anywhere under the
> read whitelist, and probing the installed host is out of scope (the installed host runs a
> *different* version). Every card ID below therefore carries the **correct full format**
> (`DSH-0.1.2-A1-xx`) and the **correct topic→surface mapping**, but the **numeric suffix is
> reconstructed** from the A1 wave ordering and is flagged *numbering-unverified*. Re-check each
> suffix against the shipped card list before any code change lands. §7.2 states exactly what is
> pinned by the fixture and what is reconstructed; §7.3 lists every unconfirmed item.

---

## 0. Executive summary

The plugin's entire behavioural contract is "read the flat conversation snapshot and derive a pose".
In 0.1.2-alpha.2 that flat snapshot is restructured and the read hook is replaced, so **all six
snapshot read surfaces break** — four are *runtime* breaks (throw inside a React render or silently
return the wrong pose), two are *compile-time* breaks.

| # | Broken surface | Source | Impact | Card |
|---|---|---|---|---|
| S1 | Flat `ConversationSnapshot` root type | `src/client/Pet.tsx:8,13` | compile (TS) | `DSH-0.1.2-A1-01` |
| S2 | `useSession(selector)` read hook | `src/client/Pet.tsx:10,18,19,21,23` | compile + runtime | `DSH-0.1.2-A1-02` |
| S3 | `snapshot.running` lifecycle flag | `src/client/Pet.tsx:19` | compile + silent | `DSH-0.1.2-A1-03` |
| S4 | `snapshot.runningCalls` in-flight calls | `src/client/Pet.tsx:21` | compile + **runtime throw** | `DSH-0.1.2-A1-03` |
| S5 | `snapshot.turnEnds[].reason` turn history | `src/client/Pet.tsx:23` | compile + **runtime throw** + wrong-value | `DSH-0.1.2-A1-04` |
| S6 | `snapshot.partial.blocks` streaming reasoning | `src/client/Pet.tsx:13-15,20` | compile + **silent pose regression** | `DSH-0.1.2-A1-05` |

Six further surfaces sit *outside* the snapshot read path but still gate the upgrade (slot key,
locale-namespace augmentation, service injection, registration descriptors) — §3, cards
`DSH-0.1.2-A1-07` / `DSH-0.1.2-A1-08`.

**Projection verdict (requirement 4), in one line:**

* **Can ride the compatibility projection first:** `running`, `runningCalls` (S3, S4).
* **Must switch to a new read path immediately:** `partial.blocks` (S6) and `turnEnds[]` (S5).

S5 and S6 are the two that cannot wait: S6 lives on a different channel entirely (streaming content
is not part of the snapshot projection) *and* its block discriminant changed; S5 carries **renamed
enum values**, so even a same-named alias would deliver wrong values — silently.

---

## 1. Scope, method, and what "break" means here

**Inspected (read-only, each file read once):** `fixture/package.json`, `fixture/cordis.patch.yml`,
`fixture/README.md`, `fixture/src/client/index.ts`, `fixture/src/client/locales.ts`,
`fixture/src/client/Pet.tsx`.

**Not consulted (by rule):** the installed dsh host (different version → out of scope),
`cordis_inspect_*` runtime introspection, any path outside the read whitelist, any `skills/` path.

Three break classes are distinguished, because they need different work and different sequencing:

* **C — compile-time:** the TypeScript type no longer exists in that shape → build/typecheck error.
* **R — runtime:** the code may type-check (or the type error may be suppressed) but throws or
  returns garbage at run time → the pet fails to render, or renders a wrong pose.
* **W — wiring:** the plugin applies (or does not) depending on service / slot / plugin-id names.

A surface that is only **C** still ships broken, so **C-only surfaces are listed too**, but the
"must switch immediately" classification in §4 is driven by **R** and **W**.

---

## 2. Snapshot read surfaces — the definite breaks

### S1 · Flat `ConversationSnapshot` root type — card `DSH-0.1.2-A1-01`

**Location:** `src/client/Pet.tsx:8` (import), `:13` (parameter type of `isThinking`).

Current:

~~~ts
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'

function isThinking(snapshot: ConversationSnapshot): boolean {
  return snapshot.partial?.blocks.some(block => block.kind === 'reasoning') ?? false
}
~~~

**What breaks (C):** in 0.1.2-alpha.2 the snapshot root is *grouped* rather than flat. The
0.1.1-rc.1 flat members (`running`, `runningCalls`, `turnEnds`, `partial`) are no longer
root-level properties of the type exported as `ConversationSnapshot`, so every field access below
becomes a type error. Because the import is *type-only*, nothing fails until typecheck/build —
the failure surfaces late, not at plugin load.

**Post-migration form (target shape):**

~~~ts
// @deepseek-ai/dsh-client-runtime/client  (0.1.2-alpha.2)
export interface ConversationSnapshot {
  readonly state: {
    readonly phase: 'idle' | 'thinking' | 'responding' | 'tool'
    readonly busy: boolean
    readonly activeCalls: readonly ActiveCall[]        // was: runningCalls
  }
  readonly turns: readonly TurnSummary[]                // was: turnEnds
  readonly compat?: {                                  // see §4; cards A1-03 / A1-06
    readonly running: boolean
    readonly runningCalls: readonly ActiveCall[]
  }
}
~~~

The selector in 0.1.2 receives **this grouped root**; the flat fields are not on it. The import
specifier `@deepseek-ai/dsh-client-runtime/client` may itself have moved in the 0.1.2 package
split — confirm the module path from the card text before editing (U-4, §7.3).

---

### S2 · The `useSession(selector)` read hook — card `DSH-0.1.2-A1-02`

**Location:** `src/client/Pet.tsx:10` (props type), `:18` (destructure), `:19`, `:21`,
`:23` (four call sites).

Current:

~~~tsx
export type PetProps = PropsRuntime<'conversation.session.header.actions'> & PropsLocale<'pet'>

export function Pet({ useSession, t }: PetProps) {
  const running     = useSession(s => s.running)
  const thinking    = useSession(isThinking)
  const toolRunning = useSession(s => s.runningCalls.length > 0)
  const lastTurnEnd = useSession(s => s.turnEnds[s.turnEnds.length - 1]?.reason)
}
~~~

**What breaks (C + R):** the slot runtime props no longer expose `useSession`. Consequences:

* **C** — `PetProps` no longer contains `useSession`, so `const { useSession, t } = props` is a
  type error and every call site fails typecheck.
* **R** — if the plugin is shipped as JS or the type error is suppressed, the destructured
  `useSession` is `undefined` and the first call throws
  `TypeError: useSession is not a function` **on the very first render** → the pet never appears
  at all (not even a broken frame).
* **R** — the *whole* selection surface changes shape at once: the selector argument is now the
  grouped root (S1), and one of the four selectors reads a channel that is no longer on the
  snapshot at all (S6).

**This is why S2 is not separable from S1/S5/S6:** renaming the hook while leaving the selector
bodies untouched converts a loud compile error into a silent wrong-pose bug.

**Post-migration form (target shape):**

~~~tsx
// The slot runtime prop is now the snapshot hook (symbol name per card DSH-0.1.2-A1-02):
export function Pet({ useSnapshot, useStream, t }: PetProps) {
  const running     = useSnapshot(s => s.state.busy)
  const toolRunning = useSnapshot(s => s.state.activeCalls.length > 0)
  const lastTurnEnd = useSnapshot(s => s.turns.at(-1)?.endReason)
  const thinking    = useStream(stream => isThinking(stream.partial?.blocks ?? []))
}
~~~

Two **separate** read paths are required after the migration — one for snapshot state, one for the
streaming channel — and they are **not** interchangeable: a snapshot selector cannot reach
streaming content (S6).

---

### S3 · `snapshot.running` — card `DSH-0.1.2-A1-03`

**Location:** `src/client/Pet.tsx:19`.

Current: `const running = useSession(s => s.running)` — read, then discarded at `:26` (`void running`).

**What breaks (C + silent R):** `running` is not a member of the 0.1.2 grouped root. Reading a
missing property yields `undefined` rather than throwing, so this is a **silent** break: the pose
logic happens to keep working (the value is discarded anyway) while the flag is gone — any future
use of `running` becomes a no-op that always reports "not running".

**Post-migration form:**

* *Preferred (native, no projection):* `useSnapshot(s => s.state.busy)`.
* *Deferred (projection):* `useSnapshot(s => s.compat.running)` — or the root-level legacy alias
  `s.running` if the projection is implemented as deprecated root aliases rather than a
  `compat` namespace (§4; the exact placement is U-3, §7.3).

**Note:** this read is currently dead code (`void running` at `:26`). The cheapest correct
migration is to **delete** the selector rather than port it — but deleting it also removes the
plugin's only in-code use of the lifecycle flag, so decide explicitly whether the pet should show
a "busy" pose at all.

---

### S4 · `snapshot.runningCalls` — card `DSH-0.1.2-A1-03`

**Location:** `src/client/Pet.tsx:21`.

Current: `const toolRunning = useSession(s => s.runningCalls.length > 0)`.

**What breaks (C + R — runtime throw):** `runningCalls` is no longer a root member, so
`s.runningCalls.length` throws
`TypeError: Cannot read properties of undefined (reading 'length')` **inside the selector, during
render** → React error boundary → potentially the whole header (not just the pet) fails to render.
This is the largest blast radius of the four selectors: it is a *dereference*, not a plain property
read.

**Post-migration form:**

* *Preferred (native):* `useSnapshot(s => s.state.activeCalls.length > 0)`.
* *Deferred (projection):* `useSnapshot(s => s.compat.runningCalls.length > 0)` — the projection
  keeps the **array** shape (not merely a count), so `.length > 0` is preserved verbatim.

The `length > 0` predicate is the one semantic in the whole file that carries across unchanged,
because "is a tool call in flight" is expressible identically in both worlds.

---

### S5 · `snapshot.turnEnds[last].reason` — card `DSH-0.1.2-A1-04`

**Location:** `src/client/Pet.tsx:23`.

Current: `const lastTurnEnd = useSession(s => s.turnEnds[s.turnEnds.length - 1]?.reason)`

**What breaks (C + R — runtime throw):** `turnEnds` is gone from the root, so
`s.turnEnds.length` throws `TypeError` during render. Note that the optional chaining is on
the **element** (`?.reason`), **not** on the array access — so the null-guard the author used for
`partial` at `:14` does not exist here. This line throws.

**Second break that a rename-only migration would miss (silent R):** the *values* of the end-reason
changed. The 0.1.1-rc.1 vocabulary (field `reason`) and the 0.1.2 vocabulary (field
`endReason`, e.g. `completed | aborted | failed | max_tokens`) are not the same set. A rename
that leaves the enum untouched compiles and renders, and then the "settled turn" pose fires for the
wrong turns — a **wrong-pose** bug with no error anywhere. This is the strongest argument for
putting S5 in the "switch immediately" bucket rather than the projection bucket.

**Post-migration form:**

~~~tsx
// native read path (0.1.2 shape): turn history is an array of turn summaries
const lastTurnEnd = useSnapshot(s => s.turns.at(-1)?.endReason)

// and remap the vocabulary explicitly:
const settled = lastTurnEnd === 'completed'   // was: lastTurnEnd === 'completed'
~~~

**Scope note:** the enum member names in 0.1.2 are unconfirmed in this cell (U-1, §7.3). The *shape*
change — an array of turn summaries with an end-reason field on the last entry — is the part that is
safe to plan against; take the literal member names from the card.

---

### S6 · `snapshot.partial.blocks` / reasoning detection — card `DSH-0.1.2-A1-05`

**Location:** `src/client/Pet.tsx:13-15` (the `isThinking` helper) and `:20` (its only call site).

Current:

~~~ts
function isThinking(snapshot: ConversationSnapshot): boolean {
  return snapshot.partial?.blocks.some(block => block.kind === 'reasoning') ?? false
}
// ...
const thinking = useSession(isThinking)
~~~

**What breaks (C + silent R):**

* **C** — `partial` is not a root member of the new snapshot, and
  `block.kind === 'reasoning'` is no longer a valid discriminant against the 0.1.2 content-block
  union.
* **R, silent** — the optional chaining `snapshot.partial?.blocks` protects the *null* case but
  **not** the *absent-field* case: with the field removed, `snapshot.partial` is `undefined`,
  `?.blocks` short-circuits, and the expression evaluates to `false` — **no throw**. The pet
  therefore stops detecting "thinking" entirely and silently falls back to the `idle` frame for
  the whole model turn. This is a **silent pose regression**, and the failure mode a manual smoke
  test is most likely to miss.
* **R, value-level** — the block discriminant changed (`reasoning` → the 0.1.2 reasoning/thinking
  block kind). Even if `partial` were still present, `block.kind === 'reasoning'` would match
  nothing: same silent regression, different cause.

**Why this is not projectable (§4):** streaming/partial content is a **separate, high-frequency
channel** from the conversation state snapshot, and it is deliberately **not** part of the
compatibility projection. No alias can bridge "a snapshot field" to "a live stream subscription" —
the read *mechanism* differs (a stored snapshot vs. a subscribed stream), not merely the field name.

**Post-migration form (target shape):**

~~~tsx
// 0.1.2: streaming content is read from its own path, not from the snapshot selector
function isThinking(blocks: readonly ContentBlock[]): boolean {
  return blocks.some(block => block.kind === 'thinking')   // 'reasoning' → 0.1.2 kind (card A1-05)
}

export function Pet({ useSnapshot, useStream, t }: PetProps) {
  const thinking = useStream(stream => isThinking(stream.partial?.blocks ?? []))
}
~~~

**Structural consequence to not miss:** `isThinking` can no longer be a **snapshot selector** (it
no longer receives the snapshot). It must become a **stream selector**, or be called with an
explicit block list inside a stream callback. Leaving `useSession(isThinking)` in place with a
rewritten helper silently reads the wrong source.

---

## 3. Supporting surfaces (outside the snapshot path, still gate the upgrade)

These are not snapshot read surfaces, but each can prevent the pet from appearing at all after the
host upgrade, so they belong in the same assessment.

### S7 · `LocaleNamespaceMap` module-augmentation target — card `DSH-0.1.2-A1-07`

**Location:** `src/client/index.ts:14-19`.

~~~ts
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    pet: PetKey
  }
}
~~~

**What breaks (C, silent):** in 0.1.2 the locale namespace map is owned by the locale package, not
by the slots package. Augmenting a module that no longer declares that interface **compiles without
error** (it merely creates a new, unused interface inside that module) — so the plugin builds, and
then `PropsLocale<'pet'>` at `Pet.tsx:10` fails to typecheck, or `t` loses the `pet` keys at
runtime.

**Post-migration form:**

~~~ts
declare module '@deepseek-ai/dsh-client-locale/client' {
  interface LocaleNamespaceMap {
    pet: PetKey
  }
}
~~~

Keep the type-only side-effect import (`index.ts:8`) so the augmentation is actually loaded —
removing it would break the merge silently. Confirm the exact owning module from the card (U-2).

### S8 · Slot key + runtime props typing — card `DSH-0.1.2-A1-08`

**Location:** `src/client/Pet.tsx:10` (`PropsRuntime<'conversation.session.header.actions'>`)
and `src/client/index.ts:40` (`{ name: 'conversation.session.header.actions', id: 'pet', order: 10 }`).

**What breaks (C/W):** the slot name is a **string literal duplicated in two files**. If 0.1.2
re-namespaces it, both sides must change together; if they drift, the type-level slot lookup and
the runtime registration disagree and the pet registers against a slot nothing renders (a silent
no-op, not an error).

**Post-migration form:** keep the two occurrences in lockstep, and preferably derive the
registration name from one shared constant so the duplication cannot drift:

~~~ts
// shared between index.ts and Pet.tsx
export const PET_SLOT = 'conversation.session.header.actions' as const
export type PetProps = PropsRuntime<typeof PET_SLOT> & PropsLocale<'pet'>
~~~

### S9 · Required-service injection list — card `DSH-0.1.2-A1-08` (candidate)

**Location:** `src/client/index.ts:29` (`export const inject = ['slots', 'conversation', 'locale']`),
`:38` (`ctx.inject(['slots', 'conversation'], ...)`).

**What breaks (W — the plugin never applies):** `conversation` is a **required** cordis-fiber
service. If 0.1.2 renames that service (the fixture calls the data "the session snapshot" and the
hook `useSession`), an unresolved required service means the plugin's `apply` is **never run** —
no pet, no error message in the plugin, just a silently absent feature.

**Post-migration form:** re-derive the service names from the 0.1.2 runtime's service list; the
`conversation` service may be named `session` or `conversationSnapshot`. This is the
highest-impact / lowest-visibility item in the whole migration — the one failure that produces
"the feature just doesn't appear" with no stack trace.

### S10 · `ctx.locale.register` dictionary shape — card `DSH-0.1.2-A1-07`

**Location:** `src/client/index.ts:36` — `ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'pet: dictionaries')`.

**What breaks (C/W):** if 0.1.2 changed the registration contract (per-locale registration, or a
`Dictionary` wrapper type), the call no longer typechecks and the pet's copy falls back to raw
keys. The `zh`/`en` dictionaries themselves (`locales.ts`) are plain records and are the
least likely part of this plugin to need changes.

### S11 · `slots.register` entry shape — card `DSH-0.1.2-A1-08`

**Location:** `src/client/index.ts:38-43`.

~~~ts
scope.slots.register(
  { name: 'conversation.session.header.actions', id: 'pet', order: 10 },
  Pet,
)
~~~

**What breaks (C/W):** the `{ name, id, order }` descriptor + component signature is the
registration API surface. If 0.1.2 changed the descriptor (e.g. added a `group`/`placement`
field, or moved `order` into the component props) the registration no longer matches the slot
contract. The fixture's own comment (`index.ts:25-28`) records the hard ordering edge: *the
`header.actions` slot is declared by ui-conversation's apply, and `register()` into an
undeclared slot throws* — so a renamed slot (S8) makes this call **throw**, not merely misbehave.

### S12 · `package.json` client wiring — card `DSH-0.1.2-A1-08` (candidate)

**Location:** `fixture/package.json:6-9`.

~~~json
"client": {
  "platform": "web",
  "inject": ["dsh-client-runtime", "dsh-client-ui-conversation", "dsh-client-locale"]
}
~~~

**What breaks (W):** the injected plugin ids are a 0.1.1-rc.1 inventory. If 0.1.2 split
`dsh-client-ui-conversation` (e.g. the slot map moved to a `dsh-client-ui-slots` client
plugin), the slot-map merge that `index.ts:10` relies on is missing and the `header.actions`
slot is never declared → `slots.register` throws (see S11). Additionally the manifest declares
**no dependency on any `@deepseek-ai/dsh-client-*` package**, although the source imports four of
them (`index.ts:6,8,10`, `Pet.tsx:7,8`) — they resolve only by hoisting. Add explicit
`peerDependencies` with a 0.1.2-alpha.2-compatible range so the plugin cannot be installed
against a host it does not support.

### S13 · `cordis.patch.yml` insert record — card `DSH-0.1.2-A1-08` (candidate)

**Location:** `fixture/cordis.patch.yml:1-3`.

**What breaks (W):** the patch inserts a single plugin entry (`id: bench-pet`,
`name: '@demo/dsh-bench-pet'`) with no platform marker. If 0.1.2 requires the platform/scope to be
declared (client vs host) — the manifest already carries `"platform": "web"` but the patch record
does not — the plugin may be registered in the wrong scope and never reach the browser runtime.
Low impact, one-line fix, cheap to verify.

---

## 4. Requirement 4 — compatibility projection vs. immediate read-path switch

### 4.1 The rule

A field may **ride the compatibility projection** only if all three hold:

1. it is **derivable** from the new state model without introducing a second source of truth;
2. its **value domain is unchanged** (a renamed field is fine; a renamed *value* is not);
3. it lives on the **same channel** as the new snapshot (a snapshot field can be projected onto the
   snapshot; a stream field cannot).

Criterion 2 is the one that bites: a projection that restores a field *name* but not its *value
vocabulary* converts a loud break into a silent wrong answer.

### 4.2 The partition

| Field (0.1.1-rc.1) | 0.1.2 source | Projection-eligible? | Verdict | Card |
|---|---|---|---|---|
| `running` (bool) | `state.busy` | ✅ derivable, same value domain, same channel | **Ride the projection** — defer to a later release | `DSH-0.1.2-A1-03` |
| `runningCalls` (array) | `state.activeCalls` | ✅ derivable, same value domain, same channel | **Ride the projection** — defer to a later release | `DSH-0.1.2-A1-03` |
| `turnEnds[].reason` (array + enum) | `turns[].endReason` (different enum) | ❌ **value domain changed** | **Switch immediately** | `DSH-0.1.2-A1-04` |
| `partial.blocks` (streaming) | stream read path (different channel + different discriminant) | ❌ **different channel + value domain changed** | **Switch immediately** | `DSH-0.1.2-A1-05` |

**Why `running` / `runningCalls` can wait:** both are pure *lifecycle* facts about the current
request. The 0.1.2 state machine already knows them, so a compatibility projection can re-expose them
under their old names — either as deprecated root aliases (`s.running`, `s.runningCalls`) or
under a `compat` namespace (`s.compat.running`, `s.compat.runningCalls`); the placement is
unconfirmed (U-3). The pet's predicates (`s.running`, `s.runningCalls.length > 0`) then keep
compiling and keep returning the same booleans, so the plugin can ship on the projection with
**only** the hook rename (S2) applied — and one of the two is a *currently dead* read anyway
(`void running` at `:26`), which lowers the cost further.

**Why `turnEnds[]` cannot wait:** the 0.1.2 turn summary carries a **different end-reason
vocabulary**. A projection that aliased the array would restore the *name* while the values stay
the new ones, so a comparison like `reason === 'completed'` would silently never match — the pet
would never play its "settled turn" celebration frame, with no error anywhere. A silent wrong-pose
bug is worse than a crash for an ambient UI element, and it is invisible to smoke testing.

**Why `partial.blocks` cannot wait:** streaming content is **not part of the state snapshot** in
0.1.2 — it has its own read path and its own lifecycle. No snapshot alias can bridge it, because
the *mechanism* differs. Worse, the block discriminant changed (`reasoning` → the 0.1.2 kind), so
even a same-named field would match nothing and the pet would sit in `idle` for the entire model
turn. This is the single most likely surface to be missed, because
`snapshot.partial?.blocks.some(...)` is *null-safe* — it does not throw when the field
disappears; it just quietly returns `false`.

### 4.3 Recommended sequencing

* **Release N (the 0.1.2-alpha.2 bump):** apply the hook rename (S2), the **native** read paths for
  `turnEnds` (S5) and `partial.blocks` (S6), and the **projection** reads for `running` /
  `runningCalls` (S3/S4). That is a single small diff: two selectors rewritten, two selectors
  re-pointed at the projection.
* **Release N+1 (after the projection window closes):** move `running` / `runningCalls` to
  `state.busy` / `state.activeCalls` and drop the projection dependency. Track this as a
  *tracked debt item* tied to the projection's removal milestone (card `DSH-0.1.2-A1-06`) rather
  than a vague "TODO" — a projection that is silently relied upon is exactly how a plugin breaks a
  second time.
* **If the projection is not enabled in your host config**, S3/S4 become *immediate* switches too:
  the projection is a host-side feature, so the plugin must not assume it. Confirm the projection
  flag and its default from the card before choosing (U-5).

---

## 5. Ordered migration plan (for later — nothing was changed here)

1. **Gate check.** Confirm the 0.1.2-alpha.2 service names and the client plugin inventory
   (S9, S12) — these decide whether the plugin applies at all.
2. **Read-path switch (same-day):** S6 (`partial.blocks` → stream path + new discriminant),
   S5 (`turnEnds` → `turns` + end-reason remap).
3. **Hook + type switch:** S2 (new read hook, two call paths), S1 (new snapshot root type).
4. **Projection consumers:** S3, S4 re-pointed at the compat surface, with a tracked removal date.
5. **Type surfaces:** S7 (augmentation target), S8 (slot key + shared constant), S1/S2 props types.
6. **Wiring:** S10 (locale register), S11 (slot register descriptor), S13 (patch record).
7. **Packaging:** S12 — add explicit `peerDependencies` on the `@deepseek-ai/dsh-client-*`
   packages with a 0.1.2-alpha.2-compatible range.
8. **Verify:** typecheck + render with (a) an idle session, (b) a model turn emitting reasoning with
   no tool call, (c) a turn with a tool call in flight, (d) a settled turn with an end reason.
   Cases (b) and (d) are the ones that catch S5/S6, because both fail *silently*.

---

## 6. Card index (reconstructed numbering — see the provenance note)

| Card | Topic | Surfaces | Projection status |
|---|---|---|---|
| `DSH-0.1.2-A1-01` | Conversation snapshot root restructure (flat → grouped); `ConversationSnapshot` type | S1 | — |
| `DSH-0.1.2-A1-02` | Read-hook replacement on slot runtime props (`useSession` → new hook); snapshot vs. stream read paths | S2, S6 (path split) | — |
| `DSH-0.1.2-A1-03` | Lifecycle flags `running` / `runningCalls` → `state.busy` / `state.activeCalls`, with compatibility projection | S3, S4 | **Projected — deferrable** |
| `DSH-0.1.2-A1-04` | Turn history `turnEnds[]` → `turns[]`; end-reason field + vocabulary change | S5 | **Not projected — switch now** |
| `DSH-0.1.2-A1-05` | Streaming/partial content read path; content-block discriminant change | S6 | **Not projected — switch now** |
| `DSH-0.1.2-A1-06` | Compatibility-projection scope, opt-in flag, removal timeline | §4.3 | cross-cutting |
| `DSH-0.1.2-A1-07` | Locale namespace-map ownership + `PropsLocale` augmentation target | S7, S10 | — |
| `DSH-0.1.2-A1-08` | Slot keys, runtime props typing, slot registration descriptor, client plugin inventory | S8, S9, S11, S12, S13 | — |

---

## 7. Provenance, verification status, and unconfirmed items

### 7.1 What is pinned by the fixture (high confidence)

* The six snapshot read surfaces, their exact source locations and their current expressions —
  read directly from `fixture/src/client/Pet.tsx`.
* The failure *mode* of each break, derived from the expressions themselves:
  `turnEnds.length` on a missing field **throws**; `partial?.blocks` on a missing field
  **returns `false`**; `runningCalls.length` on a missing field **throws**; a missing
  `running` **yields `undefined`**.
* The wiring surfaces and their locations in `index.ts`, `package.json`, `cordis.patch.yml`.
* The fixture's own recorded ordering constraint (`index.ts:25-28`): registering into an
  undeclared slot throws.

### 7.2 Reconstructed, not verifiable in this cell

* **All card numeric suffixes.** The A1 wave is reconstructed from the topic ordering; only the
  *format* (`DSH-0.1.2-A1-xx`) and the *topic→surface mapping* are asserted. Re-check every
  suffix against the shipped card list before editing. If the shipped A1 wave contains cards for
  surfaces this fixture does not touch, the suffixes will shift — that is expected and harmless for
  an assessment; the **mapping** is the part that must be re-validated.

### 7.3 Unconfirmed items (explicitly not guessed)

| ID | Unconfirmed point | Why it matters | How to close it |
|---|---|---|---|
| U-1 | Exact 0.1.2 end-reason member names and the content-block discriminant | S5/S6 correctness depends on the literal values | read card `DSH-0.1.2-A1-04` / `A1-05` |
| U-2 | Module that owns `LocaleNamespaceMap` in 0.1.2 | S7's augmentation target | read card `DSH-0.1.2-A1-07` |
| U-3 | Whether the compatibility projection re-exposes legacy names at the snapshot root or under a `compat` namespace | Changes the exact expression in §4.2/§4.3 | read cards `A1-03` / `A1-06` |
| U-4 | Whether `@deepseek-ai/dsh-client-runtime/client` still exports `ConversationSnapshot` at that path | S1's import line | read card `A1-01` / package manifest |
| U-5 | Whether the projection is on by default / requires a host flag | Decides whether S3/S4 are deferrable or immediate | read card `A1-06` |
| U-6 | The new read-hook and stream-hook symbol names | The target code in §2 is shape-accurate but name-reconstructed | read cards `A1-02` / `A1-05` |
| U-7 | The 0.1.2 service names and client plugin inventory | S9/S12 — the plugin may never apply | read card `A1-08` |
| U-8 | The exact slot key in 0.1.2 | S8/S11 | read card `A1-08` |

### 7.4 Read-only discipline

* `fixture/` was **not** modified. The seal file `fixture-seal.pre.json` lists SHA-256 hashes for
  all six fixture files; they were re-verified after this assessment and match (§7.5).
* The only files written by this run are this report and its JSON companion, under
  `agent-output/S3-snapshot-migration/`.
* No migration, install or build was executed. No host introspection (`dsh --version`,
  `--dump-config`, `cordis_inspect_*`) was run. No network access. No path outside the read
  whitelist was read; no `skills/` path was consulted.

### 7.5 Fixture seal verification (re-computed after the assessment)

| File | SHA-256 | Matches `fixture-seal.pre.json` |
|---|---|---|
| `README.md` | `c1114413138587e985b76c1fd8e43e91c9cd0e06f43b19c17b09bcca2a8b72d8` | ✅ |
| `cordis.patch.yml` | `73d74cf519c91984daef5148cf17a4ab7275dc36b0a3f4c98c755e93ff218f0a` | ✅ |
| `package.json` | `154e9fd5f8e1b9006571b0d842f7670476411b793b291e6938ade40701f1f903` | ✅ |
| `src/client/Pet.tsx` | `777a963ffa454f0ba340babb7269f378d6daca8f0f2aacbfd2c08187345b3ec3` | ✅ |
| `src/client/index.ts` | `94533a879790cdcbbe47624c4409352ea0b2f7a637284cda0e88db1f18d0dd05` | ✅ |
| `src/client/locales.ts` | `d56aa3aaff649bdd3aad777d4272e8e690b2918fb168e573953102dfddeec5ff` | ✅ |

---

### 8. Incidental (not a 0.1.2 break — noted, not scheduled)

`Pet.tsx:24,28-31` mutates `frame.current` inside `useEffect` but reads it during render
(`:31`) and never triggers a re-render, so `data-frame` lags by one render. This is
pre-existing in 0.1.1-rc.1 and unrelated to the 0.1.2 snapshot migration. Also `running` (`:19`)
and `lastTurnEnd` (`:23`) are read and then discarded (`:26-27`), so the "settled turn →
celebration frame" behaviour described in the file header (`:5`) is **not implemented** — worth
deciding deliberately, since S5 and S6 are exactly the two surfaces that would implement it.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.