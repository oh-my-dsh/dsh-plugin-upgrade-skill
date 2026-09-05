// Plugin-owned storage app: opens the artifact_index domain and prints the
// records it currently sees. Used for local verification.
import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import { JsonStorageBackend } from '@deepseek-ai/dsh-storage-json'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { spec } from './domain-spec.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = process.env.STORAGE_ROOT ?? join(here, '..', 'data')

const ctx = new Context()
await ctx.plugin(Storage)
ctx.storage.backend.register('json', new JsonStorageBackend(root))
const facility = new DomainFacility(ctx, { backend: 'json' })
const domain = await facility.open(spec)
const table = domain.table('entries')
console.log('visible records:', [...table.keys()].sort().join(', ') || '(none)')
await domain.close()
