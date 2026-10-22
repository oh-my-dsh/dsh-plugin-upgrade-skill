# JUDGE BRIEF · skill.S5-negative-naming

## Criteria (sealed rubric)
- [official-short-name] (25pt) Locate greet in dsh-plugin.naming.json and distinguish the declared plugin name from its package/coordinate. Under the supplied fixture policy it is a valid official short name, not a compatibility error. A publisher prefix may reduce collisions but is not a mandatory compatibility repair. Merely repeating greet or valid is insufficient.
- [service-collision-advice] (25pt) Locate the unprefixed service search. Explain the collision risk and classify it as a warning/recommendation rather than a compatibility error. Do not treat a strict-mode nonzero exit as proof of an incompatible API. A strict-mode command is not required.
- [shared-event-context] (25pt) Locate web-search/ready as an event shared channel. Explain that matching names alone do not establish a conflict; publisher schema compatibility and registry context determine conflicts. Informational/shared-channel wording is equivalent; an unsupported claim of global uniqueness is not.
- [coverage-and-registry-limits] (25pt) Account for the remaining declared naming surfaces (loader, tool, command, skill/provider, settings and route), which may be grouped with a justified common verdict. Distinguish local naming compatibility from unqueried registry occupancy/reservation/availability. State unknown/not checked for registry-dependent claims and propose later verification without claiming it was run. Do not invent an error from private:true, which marks test material. An explicit rejection of all-clear/reserved/globally-available claims is correct.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [unsupported-all-clear] ceiling=30 Trigger only for an affirmative, unsupported blanket conclusion that every surface passes/is globally available or publication is cleared despite the unqueried registry. Correct local compatibility verdicts, hypothetical bad examples and explicitly rejected all-clear claims do not trigger this cap.

## Candidate report(s)
#### FILE: S5-negative-naming/S5-naming-judgment.md

# S5 · Naming compatibility and registry status — four-state judgment (read-only)

| Field | Value |
|---|---|
| Task | S5 · naming four-state judgment, before publishing a community plugin |
| Mode | Read-only review (skill mode A · inspect, extended only by reading the naming manifest) |
| Input | `fixture/package.json`, `fixture/dsh-plugin.naming.json`, `fixture/README.md` |
| Authorized writes | this report only, under `agent-output/S5-negative-naming/` |
| Fixture state | unmodified; byte-identical (SHA-256 recorded in §7) |
| Registry queried | **no** — network/registry access is outside this task's authorization; no host mount, no install, no build |
| Overall verdict | **no compatibility error found; registry status unknown (not checked)** |

---

## 0. Verdict vocabulary used in this report

The brief asks for one of four states per surface. Surfaces whose *grammar and internal consistency* can be decided from the mounted files, and which carry **no** adverse finding at the layers actually checked, are reported as `clear (no adverse finding)` — a fifth, deliberately weak label. It means exactly "none of the four adverse states is supported by the evidence I have", and it is **never** a statement that the name is free, reserved, unique, or globally available.

| Verdict | Meaning in this report |
|---|---|
| `compatibility error` | The surface violates a checkable grammar/consistency rule, or collides with a name the plugin may not take. None found. |
| `collision recommendation` | Legal and loadable, but generic/unprefixed enough that a rename is **advisory** (warning level, not blocking). |
| `needs registry context` | The answer is decided by an external registry of record / host-owned namespace that was **not** queried. Stays open by design. |
| `unknown` | No evidence exists in the mounted material either way; not assessable in this cell. |
| `clear (no adverse finding)` | Passes the checks that were actually runnable; implies no external clearance claim. |

**Baseline note (skill §"pre-existing"):** no build/test baseline was collected — this is a read-only naming review with no source, no lockfile and no plugin entry; nothing was run, so there are no pre-existing failures to exempt.

---

## 1. Aggregate judgment (one line)

Across 15 checked surfaces: **0 compatibility errors, 1 collision recommendation (warning), 4 needs-registry-context, 10 clear-at-checkable-layers** — plus 3 explicit unknowns (U1–U3) that are *not* verdicts on a name. The plugin's *naming grammar* is internally coherent; its *registry standing is unknown*, and I do not upgrade either fact into the other.

---

## 2. Surface-by-surface verdicts

Source of each judgement: the two JSON files plus consistency between them. "Grammar" means the lexical conventions visible in the ecosystem material at hand (lowercase kebab-case package/loader/command ids, snake_case tool ids, `settings` namespaces restricted to lowercase letters/digits/`-` — see the skill's settings-namespace grammar note in `references/api-migration-0.1.2-alpha.2.md`; that doc covers settings namespaces only, **not** the `dsh-plugin.naming.json` policy itself).

| # | Surface | Declared value | Verdict | Basis (short) |
|---|---|---|---|---|
| 1 | Registry package name | `dsh-greet` (unscoped) | `needs registry context` | Grammar fine; ownership/availability on npm and the `dsh-` prefix policy are registry facts (S1) |
| 2 | Author namespace / scope | `acme` | `needs registry context` | Whether `acme` is an owned scope/namespace on the target registry is unqueryable here (S2) |
| 3 | Plugin short name | `greet` | `clear` — no compatibility error; prefixing is only a collision recommendation | Unprefixed short names are admissible; a prefix reduces collision risk, it is not required (S3) |
| 4 | Coordinate | `acme/greet` | `clear` (internal consistency only) | Coordinate = namespace `/` name, exactly as declared (S4) |
| 5 | `pluginNames[]` | `greet` | `clear` | Same value as #3, no second distinct claim (S5) |
| 6 | `loaderIds[]` | `acme-greet` | `clear` | Prefixed with the author namespace, kebab-case, consistent with #3/#4 (S6) |
| 7 | `services[]` | `search` | `collision recommendation` — **warning, not an error** | Generic, unprefixed service key; rename to `acme-greet-search` (or similar) recommended; an actual collision is unconfirmed (S7) |
| 8 | `tools[]` | `acme_greet_hi` | `clear` | Already namespaced in snake_case; no grammar defect visible (S8) |
| 9 | `commands[]` | `acme-greet-hi` | `clear` | Namespaced kebab-case id; distinct from the tool id (S9) |
| 10 | `skills[]` | `greet` | `clear` (advisory: prefix reduces risk) | Unprefixed skill name is admissible; the host skill catalog was not enumerated, so collision is unconfirmed, not asserted (S10) |
| 11 | `skillProviders[]` | `acme-greet-filesystem` | `clear` | Namespaced provider id (S11) |
| 12 | `events[]` | `web-search/ready` | `clear` / informational — **shared channel, not the plugin's namespace** | Channel is owned by a `web-search` provider; the plugin only subscribes. Not a claim on that namespace, so it is neither an error nor a reservation (S12) |
| 13 | `settingsNamespaces[]` | `acme-greet` | `clear` | Conforms to the settings-namespace grammar (lowercase letters/digits/`-`, leading lowercase); namespaced (S13) |
| 14 | `routes[]` | exact `/api/plugins/acme-greet/hi` | `needs registry context` (host route namespace) | Path is derived from the loader id, so it is self-consistent; whether the host reserves `/api/plugins/` for plugin-scoped routes and how it detects a clash is host-side and unverified (S14) |
| 15 | Manifest internal consistency | `schemaVersion: 1`, `policy: "dsh-plugin-naming/v1"`, coordinate vs packageName | `needs registry context` (see U3) | Fields are mutually coherent; whether schema/policy strings are the current supported pair at the target host **cannot** be confirmed from the mounted material (S15) |

Counts: **compatibility error 0 · collision recommendation 1 · needs registry context 4 (#1, #2, #14, #15) · clear 10 (#3–#6, #8–#13).** Separate from this table, §4 records three explicit unknowns (U1–U3) about checks that were never run.

---

## 3. Reasoning per surface (S1–S15)

- **S1 `dsh-greet` — needs registry context.** The name is lexically well-formed and follows the ecosystem's `dsh-` prefix convention. Two things are *not* knowable offline and are exactly what publishing needs: (a) whether the unscoped name is already taken or held by an unrelated publisher; (b) whether the ecosystem reserves or prefers `dsh-` prefixes for first-party packages. **Advisory, not a verdict change:** an author-scoped name (`@acme/dsh-greet`) or a prefixed name would remove the impersonation/squat risk — but per the skill's rule that a registry scope/package and an author namespace are *independent coordinates*, I may not derive or rewrite one from the other, so this stays a recommendation. The same doc is why I do **not** report the missing `acme` in the package name as an error.
- **S2 `acme` — needs registry context.** A namespace is a registry allocation; ownership is only provable by asking the registry of record, which was deliberately not contacted. Nothing about the string itself is invalid.
- **S3 `greet` — no compatibility error.** An unprefixed plugin short name is admissible; prefixes are a collision-reduction convention. Flagging it as an error would be the classic over-read this review is meant to avoid. It is also **not** a finding that no other plugin uses `greet` — that is a registry/community question (see §4).
- **S4 `acme/greet` — coherent.** Coordinate is exactly namespace/name. Uniqueness in a coordinate space is, again, a registry fact and is left open rather than asserted.
- **S5/S6 `greet` / `acme-greet`.** The loader id is already author-prefixed, so the load-time identifier is collision-resistant by construction. No duplicate or contradictory declaration between #3, #5 and #6.
- **S7 `search` — collision recommendation (warning).** This is the one surface where a rename is genuinely advised: `search` is a single generic noun registered unprefixed in what is effectively a host-wide service key space, so it collides first with host-shipped services or with the next plugin making the same choice. Severity is **warning**: nothing in the manifest is malformed, and service keys are usually resolved per composition, so an actual clash is unconfirmed. Recommended: `acme-greet-search`. Do **not** record this as a compatibility error.
- **S8/S9 `acme_greet_hi` / `acme-greet-hi`.** Both are already namespaced and use distinct separators per surface, so the tool/command pair cannot shadow each other. Tool names use snake_case, commands kebab-case — consistent with the ecosystem's visible conventions.
- **S10 `greet` skill.** Same reasoning class as S3: unprefixed is permitted; the advisory is only that the host's shipped skill catalog is a shared flat namespace. I did not enumerate that catalog, so no collision and no clearance is claimed.
- **S11 `acme-greet-filesystem`.** Namespaced provider id; no defect.
- **S12 `web-search/ready` — shared channel, informational.** The `web-search/` segment names a *provider*, not this plugin; consuming `ready` is a subscription, not a reservation, and it grants the plugin no ownership of that prefix. It is therefore neither a compatibility error nor a collision recommendation. Residual dependency: consuming a foreign channel presupposes that the `web-search` provider exists and emits `ready` in the target composition — not verified here (U2).
- **S13 `acme-greet` settings namespace.** Conforms to the grammar documented in the skill's settings-namespace note; author-prefixed, so it will not shadow a host settings namespace.
- **S14 route.** `/api/plugins/<loaderId>/hi` is consistent with #6. Route *reservation* belongs to the host's HTTP surface: whether `/api/plugins/` is reserved for plugin-scoped handlers, and whether the host rejects a duplicate path at mount time, is unverified — hence registry/host context rather than a pass.
- **S15 manifest self-consistency.** `schemaVersion: 1` + `policy: "dsh-plugin-naming/v1"` are internally consistent and every listed surface sits under one of the declared namespace/coordinate forms. What is unconfirmed is external: the mounted material contains **no** naming-policy specification, and the skill arm's references contain none either (a zero-hit search for `dsh-plugin.naming`/`pluginNames`/`loaderIds` across the skill tree), so I cannot certify that this schema/policy pair is the version the target host accepts.

---

## 4. "No findings ≠ no problems" — what this review did **not** establish

This is the load-bearing section. Everything below is **not checked**, and nothing above should be read as the opposite.

| # | Not established | Why it matters | Status |
|---|---|---|---|
| U1 | Registry standing of `dsh-greet`, `acme`, `acme/greet` (taken / free / squatted / reserved) | The publication question itself | **unknown — not queried.** Registry access is outside the authorized scope; no `npm view`, no HTTP, no token |
| U2 | That the plugin actually registers these names at runtime (loader row, service provide, event subscription, route mount) | A manifest can declare names the composition never mounts | **unknown — not checked.** No source/entry/profile; no host mount, no install, no build permitted |
| U3 | That `dsh-plugin-naming/v1` + `schemaVersion: 1` is the accepted policy version at the target host | Stale schema would silently void the whole declaration | **unknown — not confirmed.** No naming-policy document is mounted; the skill's references do not cover naming manifests |
| U4 | Any collision anywhere, including the one I recommend fixing | Absence of a detected collision is a property of the checks, not of the world | **not claimed.** No host service/tool/skill/route registry was enumerated |

Explicit non-claims I am making (each would be a defect if I made the opposite assertion):

1. I do **not** claim `greet` is reserved for an official plugin, nor that it is uncontested.
2. I do **not** claim `dsh-greet` is globally available, publishable, or free of squatters.
3. I do **not** claim the naming set is collision-free, nor that any collision exists beyond the advisory in S7.
4. I do **not** treat "zero compatibility errors" as "safe to publish". The two are different questions, and only the first one was answerable here.

---

## 5. Observations outside naming scope (recorded, low confidence)

- `package.json` carries only `name`, `version`, `private` — no `exports`/entry, no `dsh`/`cordis` block, and there is **no `dsh-plugin.json`** community manifest in the fixture. Whether the host discovers `dsh-plugin.naming.json` on its own is therefore unverified (feeds U2/U3), and a publishable package would normally need more metadata (license, repository, description, files). This is publication-readiness, not a naming verdict.
- `"private": true` was read as the fixture README frames it — the test-material "do not publish" discipline, **not** a defect of the plugin. Recorded, deliberately not scored.
- The fixture README states the grading requires the fixture to be byte-identical to git HEAD; §7 records hashes for that reason. No git command was run.

---

## 6. Recommendations (advisory only — nothing was changed)

1. **Before publishing, query the registry of record** for `dsh-greet`, the `acme` scope, and — if a community registry exists — the `acme/greet` coordinate; convert U1 from unknown to answered.
2. **Rename the service** `search` → `acme-greet-search` (warning-level, cheap, removes the only real collision surface).
3. **Pick one package identity deliberately**: either an author-scoped `@acme/…` package or a prefixed unscoped name; do not let the `dsh-` prefix alone imply first-party status (S1 advisory).
4. **Confirm the naming-policy schema** (`dsh-plugin-naming/v1`, `schemaVersion: 1`) against the target host before publish; if it differs, this whole manifest is informational only (U3).
5. **Add a runtime/composition check** (loader id mounted, service provided, route reachable, event received) — none of that was performed here (U2).
6. Keep the short name `greet` if desired; the prefix is a recommendation, never a requirement (S3).

---

## 7. Read-only evidence and rollback

No write, install, build, git command, network call or host mount was performed; the fixture was opened read-only. Baseline identity (also usable to prove the "do not modify" constraint):

| File | Bytes | SHA-256 | mtime (UTC) |
|---|---|---|---|
| `package.json` | 67 | `71cd34926a4686d2098c582b93f86305c772f1e7d0bee5be9f1ca64d26ec99bc` | 2026-09-03T10:21:09.665Z |
| `dsh-plugin.naming.json` | 573 | `2863bfaf22ab7c9ff69a03b06af2cc1808cec2054987fcf5c6d4c55df61cb6b0` | 2026-09-03T10:21:09.664Z |
| `README.md` | 641 | `f27373bc472e94e859b37407eaf5332fcda747a7f55110a4ea9d430644862645` | 2026-09-03T10:21:09.664Z |

**Rollback:** not applicable — no state was changed. The only artifact produced is this report. If a check is ever authorized, it can be repeated idempotently from the same three files, and the hashes above are the drift baseline.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.