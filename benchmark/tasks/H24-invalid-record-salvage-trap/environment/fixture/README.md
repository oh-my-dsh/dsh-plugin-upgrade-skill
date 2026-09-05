# artifact_index domain — handover note

This plugin keeps a derived search index (`artifact_index`) over its
authoritative source documents. The index is persisted through the dsh
storage-domain API on the JSON per-record backend.

## Authoritative source vs derived data

- **Authoritative**: the source documents under `/app/fixture/source/`.
  They are never modified by the index feature.
- **Derived / disposable**: the `artifact_index` storage domain. Every
  record can be rebuilt from the source documents; it is a cache, not a
  store of truth.

## Records

Record schema (current domain version 5):

- `id: string`
- `sourceHash: string`
- `tokens: number`

The persisted records under `/app/fixture/data/artifact_index/entries/`
are all stamped with the current version 5:

- `A.json`, `B.json` — healthy records.
- `broken.json` — written by an earlier buggy build; its payload does not
  match the schema (its `tokens` field is a string). The bytes are the only
  forensic evidence of that bug.

## Product requirements for this incident

1. One bad **derived** index record must not take the whole index feature
   down: the healthy records must keep working.
2. The corrupted bytes must be **preserved on disk** for forensic analysis —
   deleting them is not acceptable.
3. The damaged key must be rebuildable from the authoritative source
   documents afterwards.
4. This salvage policy applies to THIS disposable index domain. It must not
   become a blanket policy for authoritative data.

Note: the runtime reports the failure as a schema-validation error on one
stored record and refuses to open the domain. A colleague suggested:

> Catch the open error and continue with an empty in-memory index.

That hides the failure, loses the healthy records, and destroys nothing —
but it also preserves nothing and never lets the index come back. Another
suggestion was to delete the whole cache directory and rebuild everything:
that throws away the forensic evidence and the healthy records.

The alpha.5 runtime is installed here as the exact published version — its
published sources and type declarations live under
`node_modules/@deepseek-ai/dsh-storage-domain/` (and the `dsh-storage` /
`dsh-storage-json` siblings); that is the first-party reference for the
alpha.5 storage surface.
