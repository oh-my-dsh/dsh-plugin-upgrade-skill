# M7 Reference Solution

## Reference Changes

See [solution/plugin/](plugin/) (mirrors the real `@huanlin/dsh-plugin-d399`
adaptation commit `6184995`, "v0.2.0: 适配 DSH v0.1.2-alpha.1（client-runtime
拆分迁移）"):

1. `package.json` — `dsh.client.inject` recomposed from the deleted
   `@deepseek-ai/dsh-client-runtime` to exactly the two client platform
   modules the overlay needs: `@deepseek-ai/dsh-client-locale` +
   `@deepseek-ai/dsh-api-session-controller` (card `DSH-0.1.2-A1-25`); the
   dead peer cohort (`^0.0.1-rc.1` / `^4.0.1-rc.1`) rewritten to
   `^0.1.2-alpha.1` + `@deepseek-ai/cordis ^4.0.1` (no `-rc` suffix); version
   `0.1.3` → `0.2.0`.
2. `client.js` (browser half) — the client context type comes from
   `@deepseek-ai/cordis` (Context); the `ctx.sessions.list` store access is
   annotated `import('@deepseek-ai/dsh-api-session-controller/client').ISessions['list']`
   — that annotation is the contract the overlay compiles against. The
   in-source memo claiming the annotation can be skipped ("the store object
   is unchanged") is a trap — the type moved packages even though the runtime
   shape did not.
3. The game bodies / React overlay mount stay elided — never executed in the
   container; the exam is the inject recomposition + type surface.

## Expected judge score: 100

15 (diagnosis: names `bench-d399-overlay`, cites `DSH-0.1.2-A1-25` + `R-01`)
+ 50 (static contract: runtime gone, inject recomposed, ISessions type
source, alpha cohort, cordis `^4.0.1`) + 25 (add + web cold boot + roster
entry) + 10 (version bump + private flag) = 100.

## Core point (in one sentence)

`dsh-client-runtime` is deleted, so the web tree cannot even compose until
the inject list is recomposed to `dsh-client-locale` +
`dsh-api-session-controller` — and the sessions list store must be re-typed
from `dsh-api-session-controller/client` (`ISessions`), not left bare "since
the store object is the same".
