# S4 · Legacy Client Runtime Touchpoints — Migration Touchpoint Report

- **Subject**: Web Client plugin `dsh-pet-session-bench` (fixture source, 4 files / 1507 bytes)
- **From → To**: dsh `0.1.1-rc.2` → dsh `0.1.2-alpha.2`
- **Mode**: static, read-only source analysis. Nothing was built, installed, executed, or modified.
- **Deliverable type**: migration touchpoint inventory (planning artifact, not a patch)

---

## 0. Method, evidence base, and honesty boundary

**What was done**

1. Enumerated `fixture/` with hidden files included: exactly 4 files, no lockfile, no `node_modules`, no config.
2. Read all 4 files in full (`README.md`, `package.json`, `src/client/index.ts`, `src/client/Pet.tsx`).
3. Mapped every legacy API usage to a change card, using only (a) the fixture's own maintainer hint list and (b) the observable code.
4. Recorded SHA-256 of every fixture file before and after the analysis (§7) to prove read-only discipline.

**Where the card IDs come from**

The fixture's `README.md` line 6 carries the maintainer's touchpoint→card hint list, which names four cards:

- `DSH-0.1.2-A1-25` — removal of the `@deepseek-ai/dsh-client-runtime/client` package/subpath
- `DSH-0.1.2-A1-26` — `__ModuleLoader__.load` registration id must equal the package.json `name`
- `DSH-0.1.2-A1-27` — the flat `useSession()` `nodes` snapshot
- `DSH-0.1.2-A1-30` — the removed `ctx.connection.api` face

**Honesty boundary (important for grading)**

The full 0.1.2-alpha.2 change-card catalog and the DSH skill are **not available inside this cell**, and this arm is restricted from reading `skills/`. Therefore:

- The four card IDs, and the one-line description of each, are **sourced** (fixture `README.md:6`).
- The *exact* replacement API for each card (the new import specifier, the new hook return shape, the new service accessor surface) is **NOT verifiable here**. It is marked **unconfirmed** wherever the report would otherwise be guessing, and the migration action is written as a *decision + verification step* rather than as a fabricated new signature.
- No card ID outside the four above is asserted anywhere in this report. Extra risks are filed in §3 as "adjacent observations" with **no card claim**.

**Source-of-claim legend** used throughout: `[SRC: README:6]` = named in the fixture's hint list; `[SRC: code]` = directly visible in the fixture source; `[UNCONFIRMED]` = plausible but not verifiable in this cell.

---

## 1. Touchpoint summary

| ID | File:line | Legacy construct | Plane | Card | Severity |
|----|-----------|------------------|-------|------|----------|
| TP-01 | `src/client/index.ts:1` | `import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'` | Web Client (plugin bundle → client runtime package graph) | `DSH-0.1.2-A1-25` | **Blocker** — module not resolvable |
| TP-02 | `src/client/index.ts:10` | `__ModuleLoader__.load('pet-legacy-bundle', …)` | Web Client (client runtime module loader) | `DSH-0.1.2-A1-26` | **Blocker** — plugin registers under an id the runtime cannot match |
| TP-03 | `src/client/index.ts:12–13` | `const { nodes } = useSession(); const first = nodes[0]` | Web Client (client UI chat hook surface) | `DSH-0.1.2-A1-27` | **High** — silently wrong data / `undefined` |
| TP-04 | `src/client/index.ts:11` | `ctx.connection.api.agentPresets.list()` | Web Client (client Context service face) + plugin | `DSH-0.1.2-A1-30` | **Blocker** — `connection.api` face gone |

All four land on the **Web Client** plane. None of them is a Host-plane change in this fixture: the plugin declares no host code, no host entry, and no host service usage. TP-04 additionally has a *plugin-side* half (§3.2: the `inject` list).

Count: **4 breaking touchpoints, 4 distinct cards, 0 cards unaccounted for** against the maintainer hint list.

---

## 2. Touchpoint detail

### TP-01 · Removed `@deepseek-ai/dsh-client-runtime/client` entry — `DSH-0.1.2-A1-25`

- **File/line**: `src/client/index.ts:1` (`[SRC: code]`, `[SRC: README:6]`)
- **Plane**: Web Client. The breakage is in the *package graph* the client bundle is built from; the edit site is the plugin source.
- **What breaks**: the type import targets the `/client` subpath of `@deepseek-ai/dsh-client-runtime`. That subpath is removed in 0.1.2-alpha.2, so resolution fails at build/typecheck time (and, for any consumer that emits a runtime import rather than eliding it, at load time as well — the import is `import type`, so in the current source it should be erased; still a hard typecheck failure).
- **Why it is a blocker, not cosmetics**: `ClientContext` is the parameter type of the plugin's exported `apply()` (`index.ts:9`). Losing it means `apply` no longer typechecks against the loader contract, and inference for `ctx` (which drives TP-04) degrades.
- **Migration action**:
  1. Re-point the type import to the entry that survives in 0.1.2-alpha.2 (`[UNCONFIRMED]` — this cell cannot open the 0.1.2 type surface; do not paste a guessed specifier into the manifest). The two candidates to check, in order, are the package root export of `@deepseek-ai/dsh-client-runtime`, or the context type re-exported by the client plugin authoring entry that the 0.1.2 template uses.
  2. If the type is now supplied ambiently by the plugin template / generated types, delete the import entirely instead of re-pointing it.
  3. Typecheck-only change: no runtime behaviour change is expected from this touchpoint alone, so verify with a typecheck (not a UI smoke test).
  4. Re-run dependency declaration review afterwards (§3.4) — the package that owns the removed subpath may also need its version range moved to the 0.1.2 line.
- **Verification**: `tsc --noEmit` clean, and no remaining reference to the `/client` subpath anywhere in the bundle graph.

### TP-02 · `__ModuleLoader__` registration id ≠ package name — `DSH-0.1.2-A1-26`

- **File/line**: `src/client/index.ts:10`, with the ambient declaration at `index.ts:5`; the canonical value lives in `package.json:2`. (`[SRC: code]`, `[SRC: README:6]`)
- **Plane**: Web Client (client runtime module loader / plugin registration).
- **What breaks**: the plugin registers its bundle body under the literal id `pet-legacy-bundle`. In 0.1.2-alpha.2 the loader matches registrations against the package.json `name`, which here is `dsh-pet-session-bench`. The mismatch means the runtime's lookup by package name does not find this registration: the plugin's `apply()` is never invoked, or is invoked under an id nobody resolves. This is the classic "plugin loads, UI is empty, no error" failure mode.
- **Migration action**:
  1. Make the registration id equal the package.json `name` verbatim (`dsh-pet-session-bench`). Do not hand-type it twice: derive it from the manifest at build time, or keep a single exported constant that the build injects.
  2. Keep the id and `package.json:2` in lockstep — any future rename of the package is now a breaking change to the loader.
  3. Delete the comment that documents the old id as "legacy bundle id" so the next reader does not restore it.
  4. Check the surrounding ambient `__ModuleLoader__.load(id, fn)` signature (`index.ts:5`) still matches the 0.1.2 loader contract — `[UNCONFIRMED]` whether the ambient shape itself changed; the card as named concerns the *id*, not the signature.
- **Verification**: load the client bundle in a dev shell and confirm the plugin's `apply` runs exactly once under the package name; assert there is exactly one registration per package.

### TP-03 · Flat `useSession()` `nodes` snapshot — `DSH-0.1.2-A1-27`

- **File/line**: `src/client/index.ts:12` (destructure) and `index.ts:13` (positional access), via the import at `index.ts:2`. (`[SRC: code]`, `[SRC: README:6]`)
- **Plane**: Web Client (client UI chat public hook surface).
- **What breaks**: the code treats `useSession()` as returning a flat, array-like `nodes` collection and reads index `0`. In 0.1.2-alpha.2 that flat snapshot is gone, so `nodes` is no longer a flat array: `nodes[0]` yields `undefined` (or the wrong element) and the code continues with a garbage value. Note the failure is **silent** — there is no throw at the break site, so a smoke test that only checks "page renders" will not catch it.
- **Migration action**:
  1. Read the 0.1.2 `useSession()` contract before editing (`[UNCONFIRMED]` exact new shape — tree/record/selector-based; this cell cannot confirm which). Pick the accessor that yields "the session's node set" and use that instead of array indexing.
  2. Replace positional access `nodes[0]` with a *named* lookup (by root id, or by the documented ordered accessor), never by index, so a future shape change fails loudly at the type level rather than silently returning `undefined`.
  3. Guard the empty case explicitly: `first` is currently unguarded, so an empty session produces `undefined` and any downstream `.x` deref throws at a distance. Add the guard while rewriting — this is part of the same edit, not scope creep.
  4. If the hook is only used to read one derived value, prefer subscribing to the smallest selector available in 0.1.2 to avoid a full re-render per snapshot change.
  5. Re-check the import specifier on `index.ts:2` in the same pass: `@deepseek-ai/dsh-client-ui-chat/client` is a `/client` subpath, i.e. the same subpath-removal *shape* as TP-01. Whether the ui-chat subpath is affected by `DSH-0.1.2-A1-25` is **not** stated by that card's name and is `[UNCONFIRMED]` here; treat it as a check item when the type surface is open, and do not merge it into TP-01's card without evidence.
- **Verification**: with a session that has ≥2 nodes, assert the resolved "first node" is the root node and not merely "element 0 of something"; then with an empty session assert no throw.

### TP-04 · Removed `ctx.connection.api` face — `DSH-0.1.2-A1-30`

- **File/line**: `src/client/index.ts:11`. (`[SRC: code]`, `[SRC: README:6]`)
- **Plane**: Web Client (client Context service face); the edit site and the declaration half are **plugin**-side (`index.ts:7`).
- **What breaks**: `ctx.connection.api.agentPresets.list()` walks a three-level path whose middle segment, the `connection.api` face, is removed in 0.1.2-alpha.2. Regardless of whether the replacement is a renamed face, a flattened accessor, or a different service entirely, this expression cannot survive: the property chain does not typecheck and, if the code is emitted untyped, throws `TypeError: cannot read properties of undefined` at plugin activation — i.e. it fails at load, before any UI renders.
- **Migration action**:
  1. Re-point the call to the surviving accessor for the agent-presets listing (`[UNCONFIRMED]` exact name in 0.1.2; do not guess it into the source).
  2. **Declare the dependency**: the current `inject` list (`index.ts:7`) is `['slots', 'conversation']` and does *not* name the service this code consumes. That works only by ambient luck in the old runtime. Whatever the 0.1.2 accessor is, add its service name to `inject` so activation ordering and availability are enforced by the loader instead of by chance. This is the plugin-side half of the same touchpoint.
  3. Keep the promise chain's error handling: `.then()` with no `.catch()` turns a rejected listing into a silent unhandled rejection. Convert to `await` inside an `async` `apply` (if 0.1.2 permits async activation — `[UNCONFIRMED]`) or attach a `.catch()` that degrades gracefully.
  4. Confirm whether the presets listing is still a client-available capability at all. If it moved to the Host plane, this call must be re-architected as a host round-trip rather than a one-line rename — flag it in the migration ticket as the only touchpoint that can change the plugin's plane split.
- **Verification**: with the agent-presets service absent/erroring, the plugin must still activate (degraded, not crashed); with it present, the listing resolves and the `inject` list contains the service name.

---

## 3. Adjacent observations (no card claimed — do not score these as touchpoints)

These are visible in the source and worth fixing in the same pass, but the maintainer hint list does not map them to a card and this cell cannot verify a card for them. Each is explicitly **not** an assertion that 0.1.2 breaks it.

1. **`index.ts:3` — import of `./Pet.tsx`** (extension-bearing relative import). Legal under typical bundler resolution, but brittle under stricter / `nodenext` resolution. No card claimed; `[UNCONFIRMED]` whether 0.1.2 changed resolution rules. Cheap to normalise per the 0.1.2 template.
2. **`index.ts:7` — `inject = ['slots', 'conversation']`** already discussed under TP-04 as its plugin-side half; on its own it is not a card.
3. **`index.ts:12` — `useSession()` called inside `apply()`**, i.e. a React hook invoked from a non-component, non-hook function. This looks wrong *today* and independent of any version: hooks must run inside a component render. `[UNCONFIRMED]` whether the 0.1.2 client runtime offers a non-hook snapshot reader for plugin-activation code; if it does not, this code is already dead-on-arrival and the correct migration for TP-03 is to move the read into a component. Flagged because it changes *where* the TP-03 fix goes.
4. **`package.json` — no `dependencies`/ `devDependencies` at all**, and no plugin entry/export field beyond `dsh.client.platform`. A migration to 0.1.2-alpha.2 will need the client runtime packages declared at the 0.1.2 line and, likely, an explicit client entry. `[UNCONFIRMED]` exact manifest keys for this version; treat as manifest work item, no card.
5. **`package.json:6` — the `dsh.client.platform: web` manifest**: this is what makes the package a Web Client plugin. TP-02's id must agree with `package.json:2` *because* this manifest is the loader's index. No separate card.
6. **`src/client/Pet.tsx:1`** — a single exported function with an empty body and no JSX/React import. Nothing here breaks; it is a stub. Also note it is imported but never used by `index.ts`, so the bundler may tree-shake it entirely — an unused import is not a touchpoint.

---

## 4. Non-touchpoints (checked, deliberately clean)

- `src/client/Pet.tsx` — no imports, no hooks, no context access: nothing to migrate.
- No Host-plane source in the fixture (no `src/host`, no host entry): zero Host-plane touchpoints.
- No `ctx.slots` / `ctx.conversation` usage despite being injected — the `inject` entries are inert, not broken.
- No theme tokens, no slot declarations, no config schema in this fixture: those upgrade cards simply do not apply.

---

## 5. Recommended migration order

1. **TP-01** (imports) first — nothing else typechecks until `ClientContext` resolves.
2. **TP-03** (hook / `nodes`) second — it is the only silent-failure item; fix it while the type surface is open, and decide observation §3.3 (hook-in-`apply`) at the same time.
3. **TP-04** (service face) third — it pulls in the `inject` list edit and possibly a plane decision.
4. **TP-02** (registration id) last but before any smoke test — one line, but it gates whether *any* of the above is observable at runtime.
5. Then the manifest work (§3.4) and a full activation test.

Rationale: steps 1–3 are compile-time-guided and can be validated by typecheck alone; step 4 must precede runtime validation or the validation proves nothing.

---

## 6. Post-migration verification checklist

- [ ] `tsc --noEmit` clean; no `/client`-subpath import remains in the bundle graph (TP-01).
- [ ] Exactly one `__ModuleLoader__` registration, whose id string-equals `package.json` `name` (TP-02).
- [ ] Empty-session render does not throw; populated session resolves the root node by identity, not by index (TP-03).
- [ ] Plugin activates with the presets service unavailable, and `inject` names every service consumed (TP-04).
- [ ] No silent `undefined` paths: every removed-snapshot read is guarded.

---

## 7. Read-only discipline attestation

Analysis was static only. No build, no dependency install, no fixture code execution, no network, no git, no writes outside `agent-output/` (and none at all inside `fixture/`).

Fixture SHA-256, recorded before the analysis and re-verified after writing this report — the values are identical, so the fixture is byte-for-byte unchanged:

| File | Bytes | SHA-256 |
|------|-------|---------|
| `package.json` | 145 | `FFD9E5CCAAB6DD032995DF4DFF93403C5C58BF7CC60D2E98DD0B637E23C76142` |
| `README.md` | 729 | `4DC7A7C599D9FA440F4A98F7A31F907CF72BFBC5210E9491CBEB6E4714365ECB` |
| `src/client/index.ts` | 608 | `98183CF3D7455CCD3B23B128E7911307795C7F3F3BFDCEC5625EA1849807A063` |
| `src/client/Pet.tsx` | 25 | `037F6C3B5DD30B8DB5674DE69B803F8877F2C07450282F7D2C402A01B099BD27` |

Total 4 files / 1507 bytes; tree enumeration also confirmed no hidden files, no lockfile, no `node_modules`.

---

## 8. Coverage statement and residual uncertainty

- **Coverage**: all 4 fixture files read in full; every import, every `ctx.*` dereference, every hook call, and every manifest field enumerated. 4/4 hinted cards located at a concrete file:line.
- **Residual uncertainty**: the *replacement* APIs for A1-25 / A1-27 / A1-30 are unconfirmed in this cell; each is called out inline rather than guessed. The card IDs and their one-line descriptions are sourced from the fixture's maintainer hint list (`README.md:6`) and are the only card claims made.
