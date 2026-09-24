// Endpoint identity probe for the unified GLM-5.3-Flash run: verifies the
// endpoint actually serves the model and records the server-side identity
// fields the workplan requires (served model id, provider, date; weights
// revision / quantization when the API discloses them).
//
// Usage:
//   node benchmark/scripts/probe-glm-endpoint.mjs --run-dir <artifact-dir>
// Env:
//   ZAI_API_KEY (or ANTHROPIC_API_KEY)  — bearer token
//   ZAI_BASE_URL (default https://api.z.ai/api/anthropic)
//   ZAI_MODEL  (default glm-5.3-flash)
//
// The probe is read-only (models list + one 1-token completion) and writes
// endpoint-identity.json into the run dir. It never runs solver trials.
import { writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const DEFAULT_BASE = 'https://api.z.ai/api/paas/v4'

function arg(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function main() {
  const runDir = arg('--run-dir') ?? 'benchmark/results/artifacts/2026-09-15-glm-5.3-flash-unified-s16'
  const model = process.env.ZAI_MODEL ?? 'glm-5.3-flash'
  const openAiBase = (process.env.ZAI_OPENAI_BASE_URL ?? DEFAULT_BASE).replace(/\/$/, '')
  const key = process.env.ZAI_API_KEY ?? process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('export ZAI_API_KEY (or ANTHROPIC_API_KEY) before probing')
  const identity = {
    schemaVersion: 'endpoint-identity-v1',
    probedAt: new Date().toISOString(),
    clientAlias: model,
    openAiCompatibleBase: openAiBase,
    anthropicCompatibleBase: process.env.ZAI_BASE_URL ?? 'https://api.z.ai/api/anthropic',
    modelsListed: null,
    listedContainsAlias: null,
    completionServedModel: null,
    completionStopReason: null,
    notes: [],
  }
  const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }

  const listResponse = await fetch(`${openAiBase}/models`, { headers })
  if (listResponse.ok) {
    const list = await listResponse.json()
    const ids = (list.data ?? []).map((entry) => entry.id)
    identity.modelsListed = ids
    identity.listedContainsAlias = ids.includes(model)
    if (!identity.listedContainsAlias) {
      identity.notes.push(`alias "${model}" not in /models response; confirm the served alias with the provider before running`)
    }
  } else {
    identity.notes.push(`/models responded ${listResponse.status}; some gateways do not expose it`)
  }

  const completion = await fetch(`${openAiBase}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Reply with the single word: ok' }], max_tokens: 8 }),
  })
  if (!completion.ok) {
    throw new Error(`probe completion failed: HTTP ${completion.status} ${await completion.text()}`)
  }
  const body = await completion.json()
  identity.completionServedModel = body.model ?? null
  identity.completionStopReason = body.choices?.[0]?.finish_reason ?? null
  if (identity.completionServedModel && identity.completionServedModel !== model) {
    identity.notes.push(`server served "${identity.completionServedModel}" for alias "${model}" — record the served id as the authoritative identifier`)
  }
  identity.weightsRevision = body.system_fingerprint ?? body.id ?? null
  identity.quantization = 'not disclosed by API; record from provider docs if available'

  const target = resolve(repoRoot, runDir, 'endpoint-identity.json')
  writeFileSync(target, JSON.stringify(identity, null, 2) + '\n')
  console.log(JSON.stringify(identity, null, 2))
  console.log(`\nwrote ${target}`)
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
