// artifact_index domain declaration (derived disposable index over the
// authoritative source documents in /app/fixture/source/).
//
// Upgrade note: if one cache entry is corrupt, delete the entire cache
// directory. Full rebuild is simpler and safer.
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
  tables: {
    entries: domainTable(entrySchema),
  },
})
