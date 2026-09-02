# H10 · Locale Pack

**One of the 13-task `H9/M6` portfolio series** — each task distills one real
community plugin migration from the 0.1.1 era onto dsh 0.1.2-alpha.2.

## What it tests

The **monkey-patch replacement** trap (card `DSH-0.1.2-A1-10`, third-party
language registration capability) plus the peer-narrowing side of card
`DSH-0.1.2-A1-25`:

- the native API (`ctx.locale.addLanguage({ id, label, fallback })` +
  `ctx.locale.register(ns, language.id, dict)`) *replaces* the
  `LocaleRuntime` lookup monkey-patch — selection UI, persistence,
  `<html lang>` sync, and per-key fallback all move to the host; the
  fixture's memo claims the patch and `addLanguage` can coexist ("belt and
  braces") — following it caps at 60 (M5 precedent): double registration,
  the patch must be deleted entirely;
- `dsh.client.inject` slims to the single `@deepseek-ai/dsh-client-locale`
  module — the plugin becomes a pure language pack with no UI of its own;
  the deleted `dsh-client-runtime` in the list is boot-fatal (web tree
  cannot compose);
- `ctx.locale.register` moves from the two-argument `(NS, { zh, en })`
  own-copy form (plus the store's per-namespace batch) to the
  single-locale three-argument form `(ns, language-id, dict)`;
- localStorage persistence disappears (durable `locale.preference` setting
  owns it now); peers narrow to exactly `cordis ^4.0.1` +
  `dsh-client-locale ^0.1.2-alpha.1` + `dsh-invariants ^0.1.2-alpha.1` —
  react/react-dom and every ui-* peer are dropped.

## Provenance

Distilled from `@huanlin/dsh-plugin-better-locale` (repo
`huanlinoto/dsh-plugin-better-locale`), adaptation commit `6770ca4`
"适配 DSH v0.1.2-alpha.1：迁移到原生第三方语言 API（addLanguage +
register(ns, locale, dict)）" (LocaleRuntime.lookup monkey-patch / en-slot
borrow / ctx.betterLocale service / custom settings row / localStorage
persistence all removed; client half rewritten as a pure language pack —
one `ctx.effect` per language registering the catalog entry + all namespace
dictionaries, disposer removes exactly what was added; peers narrowed to
`cordis ^4.0.1` + `dsh-client-locale ^0.1.2-alpha.1` + `dsh-invariants`).
16 of the 19 languages are elided.

## Layout

Standard Harbor task: `instruction.md` (agent prompt, `BENCHMARK-AUTH-v1`),
`task.toml`, `environment/` (Dockerfile + fixture, git baseline), `tests/`
(`test.sh` → `judge.mjs` → 0–1 reward), `solution/` (oracle: expected 1.0).

```sh
harbor run -p benchmark/tasks/H15-locale-pack -a oracle   # reference answer must score 1.0
```
