# Source-matched factual supplement

This companion records facts mentioned in the distilled procedure. It is supplied identically to C and D. It is a declarative adaptation of the archived plugin-upgrade SKILL.md, not a newly discovered primary source. Original references remain unchanged and retain their own uncertainty labels.

## P01

DSH plugin work has three scopes: read-only inspection, installed-plugin update, and author-source migration. Inspection does not authorize installation or source changes.

Provenance: SKILL.md: Step 0; Mode A

## P02

Plugin release version and DSH host version are distinct. Registry package and Git repository coordinates are independent. package.json and lockfile own dependencies; dsh-plugin.json is an optional community manifest; cordis.patch.yml, agent.cordis.yml and legacy cordis.yml own profile composition. Resolved configuration is a runtime result, not a whole-object writeback target.

Provenance: SKILL.md: Shared read-only preparation 1–3; references/pre-flight.md: 0

## P03

An old process can keep executing old code after a checkout changes (ghost host). A global host replacement from inside that host session can kill the executing process and interrupt shim generation. The documented recovery/update procedure stops all host processes, uses an external terminal with an exact version, then restarts and verifies; a bare package name follows latest and can select an older line.

Provenance: SKILL.md: Global DSH host upgrades; references/pre-flight.md: 1.5; references/rollup-0.1.2.md: R-12

## P04

Pre-existing failures belong to the original dependency baseline and are separate from migration regressions. Rollback coverage is limited to explicitly owned files and recorded state, not arbitrary third-party lifecycle-script effects.

Provenance: SKILL.md: Mode C 0; Shared read-only preparation 5; references/rollup-0.1.2.md: R-06

## P05

The reference index uses directed from/to edges, not filename order. Curated cards are not a complete API diff. Intermediate removals can be restored at the target. Missing corridor edges do not imply coverage by later cards.

Provenance: SKILL.md: Mode C 1–2; references/README.md: Version corridor index

## P06

The seven scan classes are source patches, events, services/Remote, host filesystem, UI/commands/tools, custom channels, and subprocess/output. Heuristic scans can miss compatibility problems. Host, Web Client and ordinary-plugin interfaces have different applicability. cordis.patch.yml denotes profile composition rather than automatically being a source patch.

Provenance: SKILL.md: Mode C 3–4; references/pre-flight.md

## P07

Card applicability depends on corridor, touchpoints and interface face. Capability cards describe optional functionality. Release-note direction without exact API coordinates is insufficient evidence for an invented replacement interface.

Provenance: SKILL.md: Mode C 4–5; references/README.md: Single-card format

## P08

A successful dependency install does not establish profile enablement. Mixed old/new DSH cohorts can remain in transitive lockfile entries. Installation tracks include registry, Git, workspace/junction and copied installs, and determine the update mechanism.

Provenance: SKILL.md: Mode B 1–5; Mode C 5; Validation 1–2

## P09

Type declarations and runtime module/service activation are separate. Unexpected any inference can conceal missing or inconsistent declaration owners. The alpha.2 API ledger covers precise interface migration, including removed dsh-client-runtime, keyed chat snapshots, command execution and Workspace navigation; Connection authentication must preserve the channel protocol.

Provenance: SKILL.md: Mode C 5–6; Validation 3; references/api-migration-0.1.2-alpha.2.md; references/precision-checklist.md

## P10

A build, installation, process start or HTTP 200 alone does not prove activation. Cordis services can remain pending. Web Client validation includes the host boot manifest, advertised client artifact and actual registration/mount; the token URL is exchanged for a cookie. Host behavior validation includes a message-to-tool-to-response flow or an equivalent dedicated flow.

Provenance: SKILL.md: Validation 1–6; references/rollup-0.1.2.md: layered validation

## P11

The plugin's own SemVer and DSH host version serve different roles; packed filename and packed manifest can expose a mistaken plugin release identity.

Provenance: SKILL.md: Mode C 6

## P12

Reports distinguish pre-existing failures, completed work, skipped work, pending risks, rollback paths and recommendations. Conflicting local observations and primary sources are separate evidence. Non-idempotent or unexplained failures do not establish a safe retry.

Provenance: SKILL.md: Safety boundaries; Validation and reporting

