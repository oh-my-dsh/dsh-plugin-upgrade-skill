# H24-invalid-record-salvage-trap reference solution

See [solution/src/domain-spec.mjs](src/domain-spec.mjs) — the alpha.5
migration declares `invalidRecords: 'backup-and-skip'` on the disposable
derived-index domain, scoped to that spec only. Expected judge score 100.

## The change

`dsh-v0.1.2-alpha.5` adds `DomainSpec.invalidRecords` (DSH-0.1.2-A5-02).
Absent (the default), a stored record whose payload fails its zod schema
rejects the ENTIRE domain open with `invalid-record`. With
`'backup-and-skip'`, the facility asks the backend unit to move the failing
record's document aside (`KvUnit.backupRecord`), logs the concrete failure
(domain / table / key / destination / cause), and opens with that record
absent. A backend WITHOUT `backupRecord` (the sqlite backend implements
neither this nor `compatibleVersions`) falls back to the rejecting default —
the declaration is not a universal guarantee.

The json per-record backend implements `backupRecord` as a pure RENAME:
`<key>.json` → `<key>.json.bak.<YYYYMMDDHHmm>` — the corrupted bytes are
preserved by construction, and the moved file no longer ends in `.json`, so
every later read ignores it and a later `putRecord` recreates the key fresh.

Correct migration (one semantic change, scoped to this domain):

```js
export const spec = defineDomain({
  name: 'artifact_index',
  version: 5,
  layout: 'per-record',
  invalidRecords: 'backup-and-skip',
  tables: { entries: domainTable(entrySchema) },
})
```

- the policy is scoped to THIS disposable derived-data domain — never a
  blanket rule for authoritative data;
- the schema stays honest (`tokens: z.number()`), the version stays 5, the
  JSON per-record backend stays, the authoritative source documents stay;
- the corrupted bytes survive on disk for forensics; healthy records keep
  working; the damaged key is rebuilt from the authoritative source and
  persists across reopen.

## First-party provenance

- Repository: `deepseek-ai/deepseek-harness`
- `dsh-v0.1.2-alpha.4` = `4e84901e6471b79ec0338099867ebb4606d12bb5`
- `dsh-v0.1.2-alpha.5` = `db6bdc3576c2d4e7c965e8e3ed0c2a731eed87f5`
- `packages/storage/storage-domain/src/spec.ts` (`invalidRecords`
  declaration), `packages/storage/storage-domain/src/index.ts` (the
  facility's backup-and-skip flow + reject fallback without
  `backupRecord`), `packages/storage/storage/src/backend.ts`
  (`KvUnit.backupRecord`), `packages/storage/storage-json/src/per-record-unit.ts`
  (rename-based backup + filename stamp)
- Migration card: `DSH-0.1.2-A5-02`
  (`skills/plugin-upgrade/references/v0.1.2-alpha.5.md`)
- Published runtime the fixture pins: `@deepseek-ai/dsh-storage`,
  `@deepseek-ai/dsh-storage-json`, `@deepseek-ai/dsh-storage-domain` at
  `0.1.2-alpha.5` (exact; lockfile integrity fixed), `@deepseek-ai/cordis`
  `4.0.2`, `zod` `4.4.3`.

Every API shape was verified against the published packages before the task
shipped, including the baseline rejection and the unsupported-backend
fallback.

## Scoring

70 behavioral (real alpha.5 runtime: open resolves 20 / healthy A+B intact
15 / corrupt document moved to backup 15 / backup bytes equal the sealed
baseline 10 / damaged key absent before rebuild 5 / rebuilt key persists 5)
+ 20 migration (scoped policy 10, honest schema 5, contract 5) + 10 hygiene.
Hard caps: spec load failure → 30; downgrade → 20; alpha.4 pin → 20;
catch-and-empty → 30; schema loosened → 40 (z.any) / 60 (field-level);
backup deleted → 60; manual backup → 50; policy globalized → 70. Flat 0:
untouched fixture or sealed-file edits (the runtime's authorized rename of
the one corrupt document excepted). Full model in
[tests/judge.mjs](../tests/judge.mjs).
