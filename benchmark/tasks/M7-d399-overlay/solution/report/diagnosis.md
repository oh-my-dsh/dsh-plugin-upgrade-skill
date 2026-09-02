# Diagnosis — bench-d399-overlay on dsh 0.1.2-alpha.2

Plugin: `bench-d399-overlay` (browser game overlay: bottom-right teaser while
the model generates; client-only plugin, host half is a no-op stub — both
planes examined).

## Breaks found

1. **The client inject list names a deleted package (boot-fatal).**
   `dsh.client.inject` still lists `@deepseek-ai/dsh-client-runtime`, which
   was removed and split by domain (card `DSH-0.1.2-A1-25`); the web tree
   cannot compose with it in the list, so the profile never boots. The
   overlay actually needs exactly two client platform modules:
   `@deepseek-ai/dsh-client-locale` (the copy namespace) and
   `@deepseek-ai/dsh-api-session-controller` (the sessions service the
   overlay watches for the model-generating flag).
2. **The client context type source is gone.** The browser half's
   `ClientContext` type came from `@deepseek-ai/dsh-client-runtime/client`;
   on alpha.2 the context is the `Context` type from `@deepseek-ai/cordis`,
   with the `ctx.sessions` merge pulled type-only from
   `@deepseek-ai/dsh-api-session-controller/client`.
3. **The sessions list store must be re-typed from its new home.**
   `ctx.sessions.list` is the same store object at runtime, but its type
   (`ISessions`) now ships from
   `@deepseek-ai/dsh-api-session-controller/client` — the `list` access must
   carry the `ISessions['list']` annotation. The in-source migration memo
   ("skip the ISessions annotation to keep the bundle lean") is false: the
   annotation is the contract, and skipping it leaves the overlay on the
   deleted package's type surface.
4. **The peer cohort is dead.** `@deepseek-ai/dsh-client-runtime
   ^0.0.1-rc.1`, `@deepseek-ai/dsh-invariants ^0.0.1-rc.1` and
   `@deepseek-ai/cordis ^4.0.1-rc.1` do not match `0.1.2-alpha.2` under npm
   semver prerelease rules. The runtime peer is deleted (drop it); the rest
   move to `^0.1.2-alpha.1` (covers `0.1.2-alpha.2`), with
   `@deepseek-ai/cordis` at `^4.0.1` (the `-rc` suffix never matches the
   alpha host).
5. **The dead peer must leave every dependency block** (peer + meta), not
   just the inject list — a stale optional peer still pins a package that no
   longer exists.

## Cards

- `DSH-0.1.2-A1-25` — `@deepseek-ai/dsh-client-runtime` removed, client
  symbols migrated by domain (inject list recomposition; `ClientContext` →
  cordis `Context`; `ISessions` now ships from
  `dsh-api-session-controller/client`).
- `R-01` — back the fixture up before touching it (baseline commit present;
  verify before editing).

## Fix plan

- `package.json`: `dsh.client.inject` →
  `["@deepseek-ai/dsh-client-locale", "@deepseek-ai/dsh-api-session-controller"]`;
  peers → `@deepseek-ai/cordis ^4.0.1`, `@deepseek-ai/dsh-api-session-controller
  ^0.1.2-alpha.1`, `@deepseek-ai/dsh-client-locale ^0.1.2-alpha.1`,
  `@deepseek-ai/dsh-invariants ^0.1.2-alpha.1`, react, react-dom (all
  optional in meta); delete the runtime peer + meta row; version `0.1.3` →
  `0.2.0`.
- `client.js`: context type → `@deepseek-ai/cordis` Context; annotate the
  sessions list store access with
  `@type {import('@deepseek-ai/dsh-api-session-controller/client').ISessions['list']}`;
  delete the misleading memo.
- Deploy: isolated web profile; the roster (`__DSH_BOOT__.entries`) must list
  `<pkg>/client.js` after the client plane re-composes.
