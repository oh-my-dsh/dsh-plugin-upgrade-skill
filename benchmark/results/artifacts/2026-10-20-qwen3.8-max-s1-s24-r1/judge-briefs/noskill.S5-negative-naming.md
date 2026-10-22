# JUDGE BRIEF · noskill.S5-negative-naming

## Criteria (sealed rubric)
- [official-short-name] (25pt) Locate greet in dsh-plugin.naming.json and distinguish the declared plugin name from its package/coordinate. Under the supplied fixture policy it is a valid official short name, not a compatibility error. A publisher prefix may reduce collisions but is not a mandatory compatibility repair. Merely repeating greet or valid is insufficient.
- [service-collision-advice] (25pt) Locate the unprefixed service search. Explain the collision risk and classify it as a warning/recommendation rather than a compatibility error. Do not treat a strict-mode nonzero exit as proof of an incompatible API. A strict-mode command is not required.
- [shared-event-context] (25pt) Locate web-search/ready as an event shared channel. Explain that matching names alone do not establish a conflict; publisher schema compatibility and registry context determine conflicts. Informational/shared-channel wording is equivalent; an unsupported claim of global uniqueness is not.
- [coverage-and-registry-limits] (25pt) Account for the remaining declared naming surfaces (loader, tool, command, skill/provider, settings and route), which may be grouped with a justified common verdict. Distinguish local naming compatibility from unqueried registry occupancy/reservation/availability. State unknown/not checked for registry-dependent claims and propose later verification without claiming it was run. Do not invent an error from private:true, which marks test material. An explicit rejection of all-clear/reserved/globally-available claims is correct.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [unsupported-all-clear] ceiling=30 Trigger only for an affirmative, unsupported blanket conclusion that every surface passes/is globally available or publication is cleared despite the unqueried registry. Correct local compatibility verdicts, hypothetical bad examples and explicitly rejected all-clear claims do not trigger this cap.

## Candidate report(s)
#### FILE: S5-negative-naming/naming-judgment-report.md

# S5 · Plugin Naming Four-State Judgment Report (read-only)

**Subject:** `/app/fixture/` — `package.json` + `dsh-plugin.naming.json` (policy `dsh-plugin-naming/v1`, schemaVersion 1), plugin coordinate `acme/greet`.
**Mode:** read-only review. No file under `/app/fixture/` was created, edited, moved or deleted. No build, no repro environment, no dependency install, no migration.
**Reviewer scope:** the task cell only. Not consulted (out of the permitted boundary / forbidden by the brief): the DSH implementation checkout, any `skills/` directory, `/tmp`, system directories, the network, any registry service, the original `benchmark/tasks/` source.

---

## 0. The single most important statement in this report

**No online registry query was performed, and none was possible under this brief. Therefore this report contains zero availability facts.**

Consequently:

- Nothing below is claimed to be **"reserved"**, **"taken"**, **"conflicting"**, or **"blocked by an existing registration"**.
- Nothing below is claimed to be **"available"**, **"free"**, **"unregistered"**, or **"globally unique"**.
- Every availability question is reported as **RC (needs registry context)** or **UK (unknown / not checked)** and stays open.

Equally important, in the other direction: **0 confirmed compatibility errors is a finding, not a clean bill of health.** Of the 14 declared naming surfaces, 2 have a fact confirmed from the fixture alone, and the remaining questions are unresolved *because the evidence does not exist offline* — not because they were checked and passed. "No findings ≠ no problems" applies to this report itself.

---

## 1. Verdict vocabulary (four states) and how they compose

| Code | State | Meaning |
|---|---|---|
| **CE** | compatibility error | Provably invalid/rejectable from evidence in hand. Must be fixed before publish. Asserting CE requires proof; absence of proof means it is *not* CE. |
| **CR** | collision recommendation | Structurally valid, but the chosen name creates avoidable collision / ambiguity / shadowing risk. Rename recommended; not a blocker on its own. |
| **RC** | needs registry context | Decidable only with a registry / host / policy-server query that this review did not and may not perform. |
| **UK** | unknown / not checked | Not decidable offline at all with the materials in the cell (missing schema or policy document, missing contract definition). Reported honestly rather than guessed. |

Composition rule used below: **the four states are not mutually exclusive.** A surface typically carries one *primary* verdict plus additional flags. In particular `CR + RC` is the normal shape for a valid-but-generic name, and `UK` is attached wherever I would otherwise have to invent a rule from `dsh-plugin-naming/v1`, whose text is **not present in the fixture**.

**Latent-CE flag.** Where a surface *would* become CE under a specific policy rule that I cannot verify, I record it as `latent CE (unconfirmed)` with the exact rule named. I do not promote it to CE, and I do not dismiss it. This is the honest middle state between "it's fine" and "it's broken".

---

## 2. Verdict matrix (all declared surfaces)

| # | Surface | Value | Primary verdict | Additional flags | Availability |
|---|---|---|---|---|---|
| 1 | `plugin.namespace` | `acme` | **RC** | latent CE (unconfirmed: example-namespace reservation) | not checked |
| 2 | `plugin.name` | `greet` | **not CE** → **CR** | generic unprefixed short name | not checked |
| 3 | `plugin.coordinate` | `acme/greet` | **RC** | internally consistent with #1+#2 | not checked |
| 4 | `plugin.packageName` / `package.json name` | `dsh-greet` | **RC** | **latent CE (unconfirmed: `dsh-` reserved prefix; namespace-bearing package name)** | not checked |
| 5 | `names.pluginNames` | `["greet"]` | **CR** | style-inconsistent with #6/#13 (unprefixed vs prefixed) | not checked |
| 6 | `names.loaderIds` | `["acme-greet"]` | **not CE** | latent CE (unconfirmed: loaderId derivation rule) | not checked |
| 7 | `names.services` | `["search"]` | **CR** (warning, not error) | latent CE (unconfirmed: host-reserved service id); highest collision risk in the manifest | not checked |
| 8 | `names.tools` | `["acme_greet_hi"]` | **not CE** | properly namespaced | not checked |
| 9 | `names.commands` | `["acme-greet-hi"]` | **not CE** | properly namespaced; mirrors #8 | not checked |
| 10 | `names.skills` | `["greet"]` | **CR** | inconsistent with its own prefixed provider #11 | not checked |
| 11 | `names.skillProviders` | `["acme-greet-filesystem"]` | **not CE** | semantic mismatch with plugin purpose (UK) | not checked |
| 12 | `names.events` | `["web-search/ready"]` | **CR / informational** | third-party-owned channel; emit-vs-subscribe direction undeclared (UK); latent CE (unconfirmed: `web-search/*` host reservation); grammar UK | not checked |
| 13 | `names.settingsNamespaces` | `["acme-greet"]` | **not CE** | collision here is silent + persistent → verify | not checked |
| 14 | `names.routes` | `exact /api/plugins/acme-greet/hi` | **not CE** | self-scoped; latent CE (unconfirmed: `/api/plugins/` mount policy, first-wins semantics) | not checked |
| M1 | `schemaVersion`/`policy` pairing | `1` / `dsh-plugin-naming/v1` | **UK** | schema document absent from the cell → completeness/conformance unverifiable | n/a |
| M2 | `package.json private` | `true` | **CE (packaging layer, confirmed from fixture)** | out of naming scope; see §3.15 | n/a |

**Totals:** CE = 1 (packaging only, not naming) · CR = 4 (#2/#5 short name, #7 service, #10 skill, #12 event channel) · latent-CE-unconfirmed = 6 · RC = 3 primary (and effectively all 14 for availability) · UK = pervasive.

---

## 3. Per-surface reasoning

### 3.1 `plugin.namespace = "acme"` — RC, latent CE (unconfirmed)
Shape is a plain lowercase token with no separators: nothing in hand proves it invalid. What cannot be decided offline is **authorization**: whether the publishing identity actually holds a claim on `acme`. Namespace ownership is a registry-side record, so the verdict is RC and the availability is *not checked*.
Separately, `acme` is the conventional placeholder/example namespace in documentation and tutorials. Registries commonly reserve such namespaces. **I do not assert that this registry does** — the reservation list is not in the cell. Recorded as latent CE (unconfirmed); if the reservation exists, publishing under `acme` is a rejection, not a warning.

### 3.2 / 3.5 `plugin.name = "greet"` and `names.pluginNames = ["greet"]` — not CE, CR
The official short name is **unprefixed but valid**. The correctness argument: the name is scoped by its coordinate (`acme/greet`), so uniqueness is carried by the pair, not by the short token alone. Prefixing is therefore a **collision-avoidance recommendation, not a compatibility requirement** — calling an unprefixed short name a CE here would be over-claiming, and I decline to.
Why it is still a CR: `greet` is a short, common verb with no distinguishing content, so in any global short-name space its collision probability is high, and the manifest itself demonstrates that the prefixed form is at hand (`acme-greet` is already used as loader id, settings namespace and route segment). Recommended pre-publish action: verify `greet` against the registry, and prefer publishing the prefixed short name unless the unprefixed one is confirmed free.
Style inconsistency worth noting (not an error): every host-visible id in this manifest is prefixed except the short name (#5), the service (#7) and the skill (#10) — three unprefixed outliers against five prefixed ones, which reads as oversight rather than policy.

### 3.3 `plugin.coordinate = "acme/greet"` — RC
Cross-field consistency **is** verifiable from the fixture and it holds: `coordinate === namespace + "/" + name`, and `pluginNames[0] === name`. No mismatch. Claimability of the coordinate is a registry fact → RC, not checked.

### 3.4 `plugin.packageName = "dsh-greet"` / `package.json name` — RC with the strongest latent CE in the manifest
Confirmed from the fixture: the two files agree (`dsh-greet` in both), and the string is a well-formed lowercase package name.
Two open questions, neither resolvable read-only offline, both capable of being real blockers:
1. **Reserved first-party prefix.** A community plugin shipping under `dsh-*` presents itself as first-party. If `dsh-plugin-naming/v1` or the package registry reserves the `dsh-` prefix for official packages, this is a **CE** (impersonation/squatting class). If it does not, this is at most a **CR**. **Which branch applies is unconfirmed** — the policy text is not in the cell — so I record latent CE and refuse to assert either way.
2. **Namespace-bearing package name.** The coordinate carries `acme` but the package name does not (`dsh-greet`, not `acme-greet` / `@acme/dsh-greet`). If the policy requires the package name to encode the namespace, that is a CE; if not, it is a CR, because two unrelated publishers can both reach for `dsh-greet`-shaped names. **Derivation rule unconfirmed.**
Note also that the package-name space (npm-style) and the plugin-registry space are different registries; both are unqueried.

### 3.6 `names.loaderIds = ["acme-greet"]` — not CE
Matches the canonical NAMESPACE-NAME derivation (`acme` + `greet` → `acme-greet`) and agrees with `settingsNamespaces` and the route prefix — the most coherent surface in the manifest. One unconfirmed rule keeps it off the "clean" list: if the policy derives the loader id *from the plugin short name* (i.e. `greet` → `greet`), then declaring `acme-greet` alongside short name `greet` would be a CE. I have no evidence for that derivation rule, so: latent CE (unconfirmed), primary not-CE. Loader-id uniqueness inside a running host → RC.

### 3.7 `names.services = ["search"]` — **CR (warning), not CE**; the headline naming finding
Service ids live in a host-global lookup space: any plugin, and the host itself, resolve services by id. `search` is a single unprefixed generic word in that space — the highest collision exposure in the manifest.
Why it is **not** a CE: nothing in hand proves `search` illegal or reserved. Its shape is ordinary; unprefixed service ids are not demonstrably forbidden by any document in the cell. The fixture README asserts it is "a warning not an error", and my independent reasoning reaches the same state for a different reason — **the evidence needed to promote it to CE (a host reserved-id list) does not exist offline, and inventing it would be a false positive.**
Why it is a CR, and a strong one:
- If the host or another plugin already provides `search`, the outcome is decided by registration order, producing **silent shadowing** — behaviour that differs per install and per load order, with no error surfaced. That failure class is precisely what a pre-publish review exists to remove.
- The manifest itself contains a semantic near-neighbour: the event channel `web-search/ready` (#12), in a host that exposes web-search capability. A service named plain `search` next to a `web-search` channel is ambiguous to routing and to humans.
- The fix is one line and removes the whole class: **`search` → `acme-greet-search`** (or `acme.search`), matching the prefixing discipline the same manifest already applies to its tool, command, loader id, settings namespace and route.
Escalation path recorded honestly: if the target host reserves `search`, this becomes CE. **Unconfirmed.**

### 3.8 `names.tools = ["acme_greet_hi"]` — not CE
Namespaced snake_case in a NAMESPACE_PLUGIN_ACTION shape; carries none of the generic-word collision risk of #7. Tool-name grammar (mandatory case style, digit rules, length cap) is **UK** — schema absent — so "not CE" here means *no defect provable from the fixture*, not *validated against the grammar*. Availability in the host tool namespace → RC.

### 3.9 `names.commands = ["acme-greet-hi"]` — not CE
Namespaced kebab-case mirroring #8 with the conventional separator swap. Command ids are user-visible and often shared, so the prefix is doing real work here; residual risk is low but availability is still RC (not checked). No error claimed.

### 3.10 `names.skills = ["greet"]` — CR
Unprefixed generic skill name whose own provider is prefixed (`acme-greet-filesystem`) — an internal inconsistency inside a single feature. Skills are selected by name/description from a session catalog, so a bare `greet` is both collision-prone against any other plugin or user skill of the same name and weakly discriminating for selection.
Not CE: prefixed skill names are not demonstrably mandatory. And I deliberately do **not** assert what happens on a catalog collision — whether the host rejects, or resolves by precedence, and which side wins, is a rule I cannot verify → **UK**. Recommended rename: `acme-greet` (or `acme-greet-hi`). Availability → RC.

### 3.11 `names.skillProviders = ["acme-greet-filesystem"]` — not CE
Prefixed, descriptive, kebab-case. Provider ids are host-global (inspect providers) → availability RC. One observation, explicitly **UK** rather than a finding: the provider advertises a *filesystem* surface for a plugin whose declared names are greet / search / web-search. Whether that is accurate cannot be checked without the provider implementation, which is not in the cell and which I did not go looking for.

### 3.12 `names.events = ["web-search/ready"]` — CR / informational
The channel segment `web-search` is **not this plugin's namespace** (`acme` / `acme-greet`). So this declaration sits on a channel owned by someone else — the host or a third plugin. Three distinct points, kept separate:
1. **Informational / coupling (CR).** Depending on, or emitting into, a foreign channel couples this plugin to a contract it does not own; an upstream payload or channel rename breaks it silently. Recommendation: own events under an owned channel (`acme-greet/...`), and treat `web-search/ready` as an explicitly *subscribed* third-party contract.
2. **Direction is undeclared (UK).** `names.events` is a flat list; nothing in the fixture distinguishes *emits* from *subscribes*. That ambiguity is itself a review finding — from the manifest alone one cannot be told "you may listen to this" vs "you may not emit this".
3. **Ownership / reservation and grammar (RC / UK, latent CE unconfirmed).** Whether `web-search/ready` is an officially shared channel with a stable documented contract, another plugin's private channel, or host-reserved for host-only emission is **not determinable offline**; I claim none of them. If it is host-reserved for emission, a plugin declaring it would be CE — recorded as latent CE (unconfirmed), not asserted. Whether `/` is legal in event ids and how many segments are permitted is **UK** (schema absent); the shape looks conventional, so no CE is claimed on grammar.

### 3.13 `names.settingsNamespaces = ["acme-greet"]` — not CE
Prefixed and equal to the loader id → coherent, low intrinsic risk. The reason it still carries RC rather than a pass: settings-namespace collisions are **silent and persistent** — two plugins writing into one namespace merge or overwrite stored user settings, and the damage survives uninstall. Uniqueness should be verified before publish even though the name looks safe. Availability → not checked.

### 3.14 `names.routes = [{ kind: "exact", path: "/api/plugins/acme-greet/hi" }]` — not CE
Best-practice shape on the evidence in hand: the path is self-scoped under the plugin's own loader id, and `kind: "exact"` means it cannot prefix-shadow another plugin's routes. Consistent with #6 (it uses `acme-greet`, not the bare short name).
Open items, all RC / UK, none asserted:
- whether `/api/plugins/*` is the sanctioned community mount prefix or is host-reserved for host-served plugin API (if reserved, this is CE — **latent, unconfirmed**);
- whether exact-path registration is first-wins, in which case an earlier registrant could shadow or reject this path (semantics **UK**);
- whether the route path must be derived from the plugin id, and whether other `kind` values exist (`prefix`, `regex`) — **UK**, schema absent.
Route-table availability → not checked.

### 3.15 Meta M2 — `"private": true` in `package.json` vs "I am about to publish" — **CE at the packaging layer (confirmed from the fixture), outside the naming scope**
This is the one hard, evidence-backed blocker in the cell, and it needs no registry: a package marked `private: true` is refused by npm-style publish. It is **not** a naming finding, and the fixture README states that `private: true` is the repository's "test material, do not publish" discipline rather than part of the brief — so I report it as an observation for the publisher, not as a naming verdict, and I did not act on it (no file was modified).
It carries a second, naming-relevant consequence: because the package has never been publishable, **none of these names has ever been exercised against a real registry**, which independently reinforces why every availability cell above reads "not checked" rather than "free".
Also noted: `package.json` carries only `name` / `version` / `private`. Whether the policy requires additional package-level plugin metadata (entry point, engines, keywords) is **UK** — schema absent; I claim neither that the file is complete nor that it is incomplete.

### 3.16 Meta M1 — schema conformance — **UK**
`schemaVersion: 1` and `policy: "dsh-plugin-naming/v1"` are mutually consistent in form. Beyond that, conformance cannot be assessed: the schema/policy document is **not in the cell**, and the brief forbids searching outside it. So required-field completeness, allowed character sets and length limits, reserved-prefix lists, name-derivation rules, event grammar and the route `kind` enumeration are all **UK**. Every "not CE" in this report therefore means *"no defect provable from the fixture"* and must not be read as *"validated against `dsh-plugin-naming/v1`"*.

---

## 4. Explicit non-claims (negative capability exercised)

I refuse to assert each of the following, because the evidence does not exist in this read-only offline review:

1. That any name here is **available / free / unregistered / globally unique**. No registry was queried.
2. That any name here is **reserved / taken / already conflicting**. Equally unqueried; the restraint is symmetric.
3. That `search`, `greet`, `acme`, `dsh-` or `web-search/*` are **host- or registry-reserved**. Each is flagged latent-CE-unconfirmed where a reservation would matter; none is asserted.
4. That the manifest is **schema-valid or schema-complete** for `dsh-plugin-naming/v1`.
5. That `acme` is a namespace this publisher **may** use.
6. That the plugin **loads, registers or resolves** correctly in any host. Nothing was executed; no repro environment was built (forbidden by the brief).
7. That `web-search/ready` is emitted or subscribed, or who owns it.
8. That the route prefix `/api/plugins/` is permitted for community plugins.
9. That "0 compatibility errors" means "safe to publish" — see §5.

The fixture README states four expectations (short name `greet` valid, prefixes only recommendations; unprefixed `search` a warning not an error; `web-search/ready` an informational shared channel; unqueried registry = unknown). I treat that README as **in-fixture test material, not an authoritative policy source**, i.e. as an unverified claim. My independent reasoning above reaches compatible states for #2/#5, #7, #12 and the registry question — noted here so the agreement is not mistaken for deference.

---

## 5. Bottom line and recommended pre-publish actions

**Judgment: do not publish as-is.** Not because a naming compatibility error is proven — none is — but because:
- one packaging-layer fact **is** proven (`private: true` blocks publish);
- four surfaces carry avoidable collision risk that a rename fixes in minutes;
- **0 of 14 surfaces have any registry evidence**, so the compatibility question is genuinely undecided, and "undecided" is the correct verdict to hand a publisher.

The gating action is a registry + policy-document query, which this review is not permitted to perform. Cheapest high-value fixes, in order:

| Priority | Action | Removes |
|---|---|---|
| P1 | Query registry/policy for: reserved-prefix list, namespace claim on `acme`, host reserved service ids, and the `dsh-plugin-naming/v1` text itself | Turns 6 latent-CE flags and every RC/UK cell into a decision |
| P2 | Service `search` → `acme-greet-search` | Silent-shadowing class (#7) |
| P3 | Skill `greet` → `acme-greet` | Catalog collision + weak selection discrimination (#10) |
| P4 | Reconsider package name `dsh-greet` (drop the first-party-looking `dsh-` prefix; consider a namespace-bearing form) | Impersonation/squatting class (#4) |
| P5 | Short name `greet` → verify, or publish `acme-greet` | Global short-name collision (#2/#5) |
| P6 | Move own events to an owned channel (`acme-greet/...`); document `web-search/ready` as a subscribed third-party contract | Foreign-channel coupling + direction ambiguity (#12) |
| P7 | Verify uniqueness of the `acme-greet` loader id, settings namespace and the exact route path | Silent persistent settings merge (#13), route shadowing (#14) |
| P8 | At real publish time, remove `private: true` | Packaging blocker (M2) |

---

## 6. Fixture integrity attestation

Read-only discipline verified by SHA-256 against `fixture-hash-before.json` — all three files **identical**, byte-for-byte unchanged, timestamps untouched:

| File | SHA-256 | Match |
|---|---|---|
| `dsh-plugin.naming.json` | `2863bfaf22ab7c9ff69a03b06af2cc1808cec2054987fcf5c6d4c55df61cb6b0` | yes |
| `package.json` | `71cd34926a4686d2098c582b93f86305c772f1e7d0bee5be9f1ca64d26ec99bc` | yes |
| `README.md` | `f27373bc472e94e859b37407eaf5332fcda747a7f55110a4ea9d430644862645` | yes |

Commands executed: read-only directory listing, read-only file reads, and `Get-FileHash` / `Get-ChildItem`. No writes outside `/app/agent-output/S5-negative-naming/`. No network access. No build, install, execution or migration of any fixture content.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.