# skills/

[简体中文](README.md) | **English**

All skills live here. **One skill per folder**, with folder names in kebab-case.

## Writing conventions

```text
skills/<skill-name>/
├── SKILL.md          # Required: trigger description and decision flow
├── scripts/          # Optional: skill-specific scripts
├── references/       # Optional: detailed facts loaded on demand
└── examples/         # Optional: example code (read-only, do not run)
```

`SKILL.md` must contain at least:

```markdown
---
name: skill-name
description: One sentence on what it does, when it triggers, and the important read-only/write boundaries.
---
```

Requirements:

- `name` matches the folder name;
- `description` states both the action and the trigger scenario;
- Keep only the decision flow in the main file; put detailed material in `references/`;
- One skill focuses on one user goal; when the same goal has both read-only and write modes, branch explicitly up front;
- Write operations must show a plan and get confirmation first;
- After adding or modifying, run `node scripts/validate.mjs` at the repository root.

## Catalog

| Skill | What it does | Author |
|---|---|---|
| [plugin-workflow](plugin-workflow/) | Select and coordinate inspection, upgrades, tests, naming registration, release, and rollback with one phase ledger and separate confirmation boundaries | [@oh-my-dsh](https://github.com/oh-my-dsh) |
| [plugin-upgrade](plugin-upgrade/) | Read-only inspection, installed-plugin upgrades, host compatibility migration; seven touchpoints + version cards + safe rollback | [@oh-my-dsh](https://github.com/oh-my-dsh) |
| [plugin-write](plugin-write/) | Write DSH plugins, choose the extension form for the target Harness version, and distinguish official single-repo rules from external plugin rules | [@omdsh-dev](https://github.com/omdsh-dev) |
| [plugin-test](plugin-test/) | Choose the test level for DSH plugin changes, covering real combinations, release artifacts, and target-version product entry points | [@omdsh-dev](https://github.com/omdsh-dev) |
| [plugin-release](plugin-release/) | Package, publish, and distribute DSH plugins: release track selection, unpublished-cohort installation, CI gates, and rollback | [@omdsh-dev](https://github.com/omdsh-dev) |
| [plugin-runtime-debug](plugin-runtime-debug/) | Diagnose DSH Web plugin runtime failures against host source contracts (paste/attachment/input machine, version chips, etc.) — method-level, no answers | [@lhh010](https://github.com/lhh010) |
| [plugin-heavy-dep](plugin-heavy-dep/) | Integrate heavy dependencies (mermaid etc.) into lightweight DSH Web plugins: lazy single-file chunks, host routes with robust containment, SVG whitelist sanitization, event ownership | [@lhh010](https://github.com/lhh010) |
| [dsh-benchmark-case](dsh-benchmark-case/) | Extract a real plugin upgrade experience (or existing version cards references/v*.md) into one auto-graded Harbor benchmark task: case selection criteria, fixture & traps, judge scoring boundaries, registry sync discipline | [@vlln](https://github.com/vlln) |

## Version compatibility audit (separate entry)

**[dsh-upgrade-audit](dsh-upgrade-audit/)** ([@oh-my-dsh](https://github.com/oh-my-dsh)) — audits external compatibility and rollback between two DSH versions, producing an UPGRADE-ADAPTATION report + boundary signature table as evidence for the version cards. Maintained as an independent section; it does not change the catalog above.
