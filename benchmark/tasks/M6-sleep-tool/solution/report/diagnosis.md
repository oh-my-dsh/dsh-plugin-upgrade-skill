# Diagnosis — bench-sleep-tool on dsh 0.1.2-alpha.2

Plugin: `bench-sleep-tool` (host-only tool plugin, one `sleep` tool, no client
half — the `dsh.client` plane does not apply).

## Breaks found

1. **Bare `cordis` peer is dead.** The 0.1.1-era contract provided the bare
   `cordis` package; on 0.1.2-alpha.2 the host contract is
   `@deepseek-ai/cordis` (`^4.0.1`). The in-source "migration memo" claiming
   bare `cordis` is "just a scoped alias" is wrong — the loader no longer
   provides it. The `Context` type moves to `@deepseek-ai/cordis`.
2. **`ContentBlock` moved from `@deepseek-ai/dsh-tools` to
   `@deepseek-ai/dsh-llm`.** `ToolRunContext` stays on `dsh-tools`, but its
   `callId`/`rootCallId` are now `ToolCallId`. The `dsh-llm` package must be
   added as a peer.
3. **Peer lower bounds are on a dead cohort.** `@deepseek-ai/dsh-tools
   ^0.0.1-rc.1` and `cordis ^4.0.0-rc.7` do not match `0.1.2-alpha.2` under
   npm semver's prerelease rules (an rc prerelease range never matches an
   alpha of a different prerelease identity). Both floors must be rewritten to
   the `0.1.2-alpha` cohort (`^0.1.2-alpha.1` covers `0.1.2-alpha.2`).
4. **Peer optionality must be kept in sync**: all three peers are provided by
   the host at runtime and stay `optional` in `peerDependenciesMeta`.

## Cards

- `DSH-0.1.2-A2-03` — NPM packages trim unneeded peer dependencies (peer
  hygiene: rewrite dead floors, declare the moved symbol's new package).
- `R-01` — back the fixture up before touching it (baseline commit already
  present; verify before editing).

## Fix plan

- `package.json`: peers → `@deepseek-ai/cordis ^4.0.1`,
  `@deepseek-ai/dsh-tools ^0.1.2-alpha.1`, `@deepseek-ai/dsh-llm
  ^0.1.2-alpha.1`; meta optional ×3; version `0.1.0` → `0.1.1`.
- `index.js`: type annotations repointed (`Context` ← `@deepseek-ai/cordis`;
  `ContentBlock` ← `dsh-llm`; `ToolRunContext` ← `dsh-tools`); delete the
  misleading memo; no bare `cordis` reference survives.

The registration surface (`ctx.tools.register`) is unchanged across the
migration and needs no change. The break is contract-level — the headless
boot stays green either way, so activation alone does not prove the fix; the
peer block does.
