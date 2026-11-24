---
kind: dsh-version-jump-card-set
schema: 1
from: dsh-v0.2.1-alpha.5
to: dsh-v0.2.2-alpha.2
status: draft
coverage: curated
cardCount: 6
idPrefix: DSH-0.2.2-J1
verifiedAt: 2026-10-28
---

# Change cards · 0.2.1-alpha.5 → 0.2.2-alpha.2

> This file is a curated list of plugin-relevant changes, not a complete API diff.
>
> Upstream comparison: [dsh-v0.2.1-alpha.5...dsh-v0.2.2-alpha.2](https://github.com/deepseek-ai/deepseek-harness/compare/dsh-v0.2.1-alpha.5...dsh-v0.2.2-alpha.2)
> · Release notes: [dsh-v0.2.2-alpha.2](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.2-alpha.2)
> · Card format: see [references/README.md](README.md) · Touchpoint numbering: see [pre-flight.md](pre-flight.md)
>
> **This is a version-jump edge.** It spans `0.2.1-alpha.5 → 0.2.1-rc.1 → 0.2.1-rc.2 →
> 0.2.1-rc.3 → 0.2.1-rc.4 → 0.2.2-alpha.2` (`0.2.2-alpha.1` was never published). It records
> the **net** state change for a deployment that stopped at 0.2.1-alpha.5 and is moving straight
> to 0.2.2-alpha.2. The intermediate corridors are carded per-edge; do not read this file as
> their ledger.
>
> Per-edge cards: [v0.2.1-rc.1.md](v0.2.1-rc.1.md) (DSH-0.2.1-R1), [v0.2.1-rc.3.md](v0.2.1-rc.3.md)
> (DSH-0.2.1-R2, covering rc.2+rc.3), [v0.2.1-rc.4.md](v0.2.1-rc.4.md) (DSH-0.2.1-R3), and
> [v0.2.2-alpha.2.md](v0.2.2-alpha.2.md) (DSH-0.2.2-A2). Card IDs here use the `DSH-0.2.2-J1`
> prefix. This file is schema-validated as `kind: dsh-version-jump-card-set` but is not a
> corridor edge: `plan-migration.mjs` builds corridors only from the per-edge `v*.md` files.
>
> **Coverage gap — read first**: the six cards below are drawn from release notes, npm pack diffs, and a
> fleet sweep. The `dsh-v0.2.2-alpha.2` tree also ships 34 official upgrade guides for this window that are
> not carded yet — several breaking (Node.js 24.9 floor, bundle lists moved to
> `@deepseek-ai/dsh-official-bundles`, executor plugins, the `webserver/index-inject` Peer argument). They
> are listed in [v0.2.2-alpha.2.md](v0.2.2-alpha.2.md#coverage-gap--upstream-upgrade-guides-not-yet-carded);
> read them before migrating. The window also nets in [DSH-0.2.1-R2-03](v0.2.1-rc.3.md) (New Session reuses
> blank Sessions again) and [DSH-0.2.1-R3-01](v0.2.1-rc.4.md)'s ACP stdout fix.

## Contents

- DSH-0.2.2-J1-01 · gate: the DSH peer-compatibility ledger must name 0.2.2-alpha.2 before the host boots your plugin
- DSH-0.2.2-J1-02 · capability: the plugin lifecycle is now dependency-aware end to end — sync, hot-apply, third-party updates with rollback
- DSH-0.2.2-J1-03 · capability: model and web surfaces — DeepSeek-V4.1-Flash-1017 native adapter; opt-in DeepSeek Search & Fetch providers
- DSH-0.2.2-J1-04 · capability: in-app plugin discovery grows into rich-text detail pages — README is now first-class UI
- DSH-0.2.2-J1-05 · capability: a wholly new Web Client bundle — mobile/narrow overhaul, composer quoting, draft retention
- DSH-0.2.2-J1-06 · verification: rc.4 was a synchronization release; the six-plugin fleet crossed the window zero-adaptation on its own surfaces

---

### DSH-0.2.2-J1-01 · gate: the DSH peer-compatibility ledger must name 0.2.2-alpha.2 before the host boots your plugin

- **Type**: breaking
- **Applies to**: every plugin installed on a deployment jumping this window — the enforcement that arrived in 0.1.7-rc.1 keeps operating at install and startup; a ledger row ending at `0.2.1-alpha.5` (or any rc) is refused against a `0.2.2-alpha.2` host
- **Touchpoints**: none (install/boot gate — compatibility ledger)
- **Action level**: required
- **Symptoms**:
  - Plugins whose `compatibility.json` dsh list stops before `0.2.2-alpha.2` are denied at install and disabled at startup on the new host, with the denial still visible in `--dump-config`.
  - The fleet's own plugins crossed by adding the version to their ledgers — no code change anywhere in this window required one.
- **Migration recipe**:
  1. Add `0.2.2-alpha.2` to the plugin's compatibility dsh list and cut a declaration release; verify the row appears in `--dump-config` after upgrade.
- **Verification**: install the plugin on the new host and confirm it boots; a refused row names the missing version.
- **Source**: primary — [`@deepseek-ai/dsh@0.2.2-alpha.2` on npm](https://www.npmjs.com/package/@deepseek-ai/dsh/v/0.2.2-alpha.2) (the installed host enforcing the ledger); per-edge records: [v0.2.1-rc.1.md](v0.2.1-rc.1.md) (R1), [v0.2.2-alpha.2.md](v0.2.2-alpha.2.md) (A2-03 first-hand sweep).
- **Field note** (first-hand, 2026-10-28): the six-plugin fleet shipped same-day declaration releases for rc.4 and for 0.2.2-alpha.2 on contract-sweep evidence — both rounds were zero-adaptation.

### DSH-0.2.2-J1-02 · capability: the plugin lifecycle is now dependency-aware end to end — sync, hot-apply, third-party updates with rollback

- **Type**: capability
- **Applies to**: every plugin — enable/disable/uninstall/update resolve the dependency graph (rc.1), and the manager can now update third-party packages with old-version recovery when a hot-apply fails (0.2.2-alpha.2)
- **Touchpoints**: #5 (plugin detail page); install/update surface otherwise
- **Action level**: optional
- **Symptoms**:
  - Lifecycle operations sync dependencies; stale mappings clear on uninstall; updates hot-apply where replaceable (R1-01), extended by the 0.2.2 update pipeline behind new `build-approval`/`bundle-detail`/`git-transport`/`versions` API files (A2-01).
  - A failed hot-apply falls back to the old version instead of leaving the profile broken.
- **Migration recipe**:
  1. Nothing mandatory. Plugins shipping their own update-check chips coexist — the chip reads tags, the manager installs.
- **Verification**: run one no-op update on the new host and confirm the approval/rollback path resolves.
- **Source**: primary — [dsh-v0.2.2-alpha.2 release notes](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.2-alpha.2)（插件管理条目）; per-edge records: [v0.2.1-rc.1.md](v0.2.1-rc.1.md) (R1 consolidation), [v0.2.2-alpha.2.md](v0.2.2-alpha.2.md) (A2-01).

### DSH-0.2.2-J1-03 · capability: model and web surfaces — DeepSeek-V4.1-Flash-1017 native adapter; opt-in DeepSeek Search & Fetch providers

- **Type**: capability
- **Applies to**: profile maintainers selecting models and plugin authors shipping web-search/fetch providers
- **Touchpoints**: #2 (model directory contents), #5 (web search/fetch provider selection)
- **Action level**: informational
- **Symptoms**:
  - The DeepSeek adapter offers V4.1-Flash-1017 (rc.2); web-search settings gain an opt-in native DeepSeek Search/Fetch provider, default off — one more selectable row, never a replacement for plugin providers (R2-01).
- **Migration recipe**:
  1. None. Plugins hard-failing on unknown model ids treat an open set as closed — that is the plugin's bug.
- **Verification**: with the toggle off, diff a search-exercising session against alpha.5; enable it and confirm coexistence.
- **Source**: primary — [dsh-v0.2.1-rc.2 release notes](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.1-rc.2)（适配器与 Search/Fetch 条目）; per-edge record: [v0.2.1-rc.3.md](v0.2.1-rc.3.md) (R2-01).

### DSH-0.2.2-J1-04 · capability: in-app plugin discovery grows into rich-text detail pages — README is now first-class UI

- **Type**: capability
- **Applies to**: every published plugin — 「更多」 menus surface browsing/creation in the sidebar and conversation views (rc.3), and the plugin manager renders README as a rich detail page (0.2.2)
- **Touchpoints**: #5 (detail page content); discovery surface otherwise
- **Action level**: optional
- **Symptoms**:
  - Discovery menus render existing registry/marketplace metadata; the 0.2.2 manager extends the same surface with README rendering (R2-02 → A2-01).
- **Migration recipe**:
  1. Optional polish: complete `description`/locale metadata and keep README presentable — that is what these surfaces show.
- **Verification**: open each 「更多」 entry and the plugin detail page; confirm names/icons/descriptions read well.
- **Source**: primary — [dsh-v0.2.1-rc.3 release notes](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.1-rc.3)（「更多」菜单条目）; per-edge records: [v0.2.1-rc.3.md](v0.2.1-rc.3.md) (R2-02), [v0.2.2-alpha.2.md](v0.2.2-alpha.2.md) (A2-01).

### DSH-0.2.2-J1-05 · capability: a wholly new Web Client bundle — mobile/narrow overhaul, composer quoting, draft retention

- **Type**: capability
- **Applies to**: plugins contributing UI — the whole shell is restyled for touch/narrow screens; the composer gains quoting with compact previews and read-only sends that preserve drafts (including quotes and attachments) on failure
- **Touchpoints**: #5 (Web Client seat)
- **Action level**: informational
- **Symptoms**:
  - `dsh-web-frontend` ships an entirely new asset bundle in 0.2.2-alpha.2 (A2-02); along the window New Session reuses the Workspace's blank Session again, which retains unsent drafts across session switches (rc.3, R2-03) and message display only after host acknowledgment.
  - The fleet sweep (A2-03) found every slot, service, and remote API **the fleet uses** intact; that is not a whole-window claim — client API changes such as `file-drag-callbacks` and `model-badge-package-removal`, and the `webserver/index-inject` event change, are in the coverage-gap list.
- **Migration recipe**:
  1. None. Spot-check contributed panels once at narrow width; the host now exercises narrow screens far more.
- **Verification**: run a session in a narrow window; confirm contributed entries stay reachable and legible.
- **Source**: primary — [dsh-v0.2.2-alpha.2 release notes](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.2-alpha.2)（移动端与 composer 条目）; per-edge records: [v0.2.2-alpha.2.md](v0.2.2-alpha.2.md) (A2-02), [v0.2.1-rc.3.md](v0.2.1-rc.3.md) (R2-03 New Session blank reuse).

### DSH-0.2.2-J1-06 · verification: rc.4 was a synchronization release; the six-plugin fleet crossed the window zero-adaptation on its own surfaces

- **Type**: fix
- **Applies to**: the maintained fleet and any plugin doing its own sweep before declaring compatibility
- **Touchpoints**: none (fleet verification record)
- **Action level**: informational
- **Symptoms**:
  - rc.4 re-versioned all 83 workspace packages with a byte-identical CLI `lib/` and only an ACP stdout fix (R3-01); the 0.2.2-alpha.2 contract sweep found every fleet slot, optional service (`uiSession`/`inputTriggers`/`jobs`), and session-remote API alive (A2-03).
  - The sweep corpus lesson: the slot catalog lives in the host-side `dsh-cordis-client-runner`, not the frontend shell — scanning the shell reads every marker as GONE.
- **Migration recipe**:
  1. For your own sweep, scan the installed runtime's `dsh-cordis-client-runner/lib` plus the API provider packages, not the frontend assets.
- **Verification**: the fleet's smoke surface (panels, one game round-trip, one trace with reveal/open gestures) on 0.2.2-alpha.2.
- **Source**: primary — [`@deepseek-ai/dsh@0.2.2-alpha.2`](https://www.npmjs.com/package/@deepseek-ai/dsh/v/0.2.2-alpha.2) (first-hand installed-runtime sweep, 2026-10-28); per-edge records: [v0.2.1-rc.4.md](v0.2.1-rc.4.md) (R3-01), [v0.2.2-alpha.2.md](v0.2.2-alpha.2.md) (A2-03).
- **Field note** (first-hand, 2026-10-28): paste-input's bundle version literal required re-stamping after a previous stamp was lost to a later revert — declaration tooling should assert the literal matches `package.json` before tagging.
