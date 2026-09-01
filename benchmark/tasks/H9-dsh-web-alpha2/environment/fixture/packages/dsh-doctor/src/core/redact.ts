/**
 * Deterministic secret redaction.
 *
 * Redaction happens at capture time, before any capsule write. Values are
 * replaced by a marker that embeds a short digest of the original value, so
 * two snapshots carrying the same secret produce the same redacted text and
 * the same fingerprint without ever exposing the secret itself.
 */
import { canonicalJson, sha256Short } from './hash.ts'
import type { RedactionHit, RedactionResult, RedactionRule } from './types.ts'

/** Marker format: [REDACTION:<rule id>:<sha256-8>]. */
function marker(rule: string, value: string): string {
  return '[REDACTION:' + rule + ':' + sha256Short(value) + ']'
}

/**
 * Default rule set. Covers DSH profile secret placement: settings documents,
 * credentials files, .env entries, MCP header values, provider keys, and the
 * dump-config output (which prints home patch configs verbatim, including
 * 'Authorization: Token ...' headers).
 */
export function defaultRules(): RedactionRule[] {
  return [
    { id: 'key:api-key', kind: 'key', re: /^(?:api[-_ ]?key|api[-_ ]?secret|api[-_ ]?token)$/i },
    { id: 'key:access', kind: 'key', re: /^(?:access[-_ ]?key|access[-_ ]?token|access[-_ ]?secret)$/i },
    { id: 'key:token', kind: 'key', re: /^(?:token|auth[-_ ]?token|session[-_ ]?key|session[-_ ]?token|webhook[-_ ]?secret|mcp[-_ ]?token|chatgpt[-_ ]?token|secret[-_ ]?key|secret)$/i },
    { id: 'key:auth', kind: 'key', re: /^(?:authorization|auth|authenticator|bearer(?:[-_ ]?token)?|credential|credentials|password|passwd|private[-_ ]?key|client[-_ ]?secret)$/i },
    { id: 'pattern:authorization', kind: 'pattern', re: /Authorization\s*:\s*(?:Bearer|Token)\s+\S+/gi },
    { id: 'pattern:bearer-token', kind: 'pattern', re: /(?:Bearer|Token)\s+(?:m0-)?[A-Za-z0-9_-]{16,}/g },
    { id: 'pattern:sk-key', kind: 'pattern', re: /sk-[A-Za-z0-9]{16,}/g },
    { id: 'pattern:mcp-key', kind: 'pattern', re: /m0-[A-Za-z0-9]{16,}/g },
    { id: 'pattern:aws-key', kind: 'pattern', re: /AKIA[0-9A-Z]{16}/g },
    { id: 'pattern:private-key', kind: 'pattern', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gi },
    { id: 'pattern:basic-auth', kind: 'pattern', re: /basic\s+[A-Za-z0-9+/=]{12,}/gi },
  ]
}

/** Whether a key name matches any key rule. */
export function matchesKeyRules(name: string, rules: RedactionRule[]): string | undefined {
  for (const rule of rules) {
    if (rule.kind !== 'key') continue
    if (rule.re.test(name)) return rule.id
  }
  return undefined
}

/**
 * Redact one value: returns the value unchanged when no rule matches, else
 * the deterministic marker. Object/array values are redacted deeply.
 */
export function redactValue(value: unknown, rules: RedactionRule[] = defaultRules(), hits: RedactionHit[] = []): unknown {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'string') return redactString(value, rules, hits)
    return value
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, rules, hits))
  }
  const record = value as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(record)) {
    const valueAtKey = record[key]
    const ruleId = matchesKeyRules(key, rules)
    if (ruleId !== undefined && typeof valueAtKey === 'string') {
      out[key] = marker(ruleId, valueAtKey)
      bump(hits, ruleId)
    } else {
      out[key] = redactValue(valueAtKey, rules, hits)
    }
  }
  return out
}

function redactString(value: string, rules: RedactionRule[], hits: RedactionHit[]): string {
  let result = value
  for (const rule of rules) {
    if (rule.kind !== 'pattern') continue
    rule.re.lastIndex = 0
    let changed = false
    result = result.replace(rule.re, (full) => {
      changed = true
      return marker(rule.id, full)
    })
    if (changed) bump(hits, rule.id)
  }
  return result
}

function bump(hits: RedactionHit[], rule: string): void {
  const existing = hits.find((hit) => hit.rule === rule)
  if (existing !== undefined) existing.count += 1
  else hits.push({ rule, count: 1 })
}

/**
 * Text redaction used for settings, patch, and dump documents: key-value
 * lines redact by key; then whole-text value patterns run over the joined
 * document so multi-line matches (private key blocks) are covered too.
 */
export function redactText(text: string, rules: RedactionRule[] = defaultRules()): RedactionResult {
  const hits: RedactionHit[] = []
  const normalized = text.replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')
  const out: string[] = []
  for (const line of lines) {
    const match = /^(\s*)([A-Za-z0-9_. -]+?)\s*:\s*(.*)$/.exec(line)
    if (match !== null) {
      const indent = match[1]
      const key = match[2].trim()
      const rest = match[3]
      const ruleId = matchesKeyRules(key, rules)
      if (ruleId !== undefined && rest !== '') {
        bump(hits, ruleId)
        out.push(indent + match[2] + ': ' + marker(ruleId, rest.trim()))
        continue
      }
    }
    out.push(redactString(line, rules, hits))
  }
  const result = redactString(out.join('\n'), rules, hits)
  return { text: result, fingerprint: fingerprintText(result), hits: hits.sort(byRuleId) }
}

function byRuleId(a: RedactionHit, b: RedactionHit): number {
  return a.rule < b.rule ? -1 : a.rule > b.rule ? 1 : 0
}

/** Redact a structured object (dumps, parsed settings) and return the result. */
export function redactObject(value: unknown, rules: RedactionRule[] = defaultRules()): { value: unknown; fingerprint: string; hits: RedactionHit[] } {
  const hits: RedactionHit[] = []
  const redacted = redactValue(value, rules, hits)
  return { value: redacted, fingerprint: fingerprintObject(redacted), hits: hits.sort(byRuleId) }
}

/** Fingerprint of an already-redacted text (no re-redaction). */
export function fingerprintText(text: string): string {
  return sha256Short(text.replace(/\r\n/g, '\n') + '\n')
}

/** Fingerprint of a redacted structured value. */
export function fingerprintObject(value: unknown): string {
  return sha256Short(canonicalJson(value))
}

/** Replace every occurrence of a home prefix with a symbolic placeholder. */
export function anonymizeHome(text: string, home: string): string {
  return text.split(home).join('$DSH_HOME')
}

