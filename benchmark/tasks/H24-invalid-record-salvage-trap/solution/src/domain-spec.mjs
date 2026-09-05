// artifact_index domain declaration — migrated to dsh 0.1.2-alpha.5.
// The index is disposable derived data (rebuildable from the authoritative
// source documents), so one schema-invalid record is salvaged through the
// alpha.5 backup-and-skip contract: the corrupted bytes are preserved on
// disk, only that record is skipped, and the key can be rebuilt later.
// The policy stays scoped to THIS domain spec.
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'

export const entrySchema = z.object({
  id: z.string(),
  sourceHash: z.string(),
  tokens: z.number(),
})

export const spec = defineDomain({
  name: 'artifact_index',
  version: 5,
  layout: 'per-record',
  invalidRecords: 'backup-and-skip',
  tables: {
    entries: domainTable(entrySchema),
  },
})
