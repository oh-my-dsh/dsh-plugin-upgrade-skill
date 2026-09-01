/**
 * Deterministic secret redaction (rules, markers, fingerprints).
 */
import { describe, expect, it } from 'vitest'
import { anonymizeHome, defaultRules, redactObject, redactText, redactValue } from '../src/core/redact.ts'

const SETTINGS = `llm:
  provider: deepseek
  apiKey: sk-ABCDEF123456789012345678
mcp:
  headers:
    Authorization: Token m0-abcdefghijklmnop12345678
nonSecret:
  note: keep me
`

describe('key rules', () => {
  it('redacts key-value pairs by key name', () => {
    const result = redactText(`apiKey: sk-secret-123
api_key: x
Authorization: Token m0-abc
note: plain
`)
    expect(result.text).toContain('apiKey: [REDACTION:key:api-key:')
    expect(result.text).toContain('api_key: [REDACTION:key:api-key:')
    expect(result.text).not.toContain('sk-secret-123')
    expect(result.text).not.toContain('m0-abc')
    expect(result.text).toContain('note: plain')
  })

  it('keeps benign values untouched', () => {
    const result = redactText(`model: deepseek-chat
maxTokens: 4096
tokenizer: not-a-secret
`)
    expect(result.text).toBe(`model: deepseek-chat
maxTokens: 4096
tokenizer: not-a-secret
`)
    expect(result.hits).toEqual([])
  })

  it('markers embed a stable short hash of the original value', () => {
    const a = redactText('apiKey: hello-world')
    const b = redactText('apiKey: hello-world')
    expect(a.text).toBe(b.text)
    expect(a.fingerprint).toBe(b.fingerprint)
    expect(a.text).toContain('[REDACTION:key:api-key:')
  })
})

describe('value patterns', () => {
  it('redacts auth headers and value patterns even under unknown keys', () => {
    const result = redactText(`line1 Authorization: Bearer ABCDEFGHIJKLMNOPQWXYZ
line2 abc: sk-1234567890abcdefghij
`)
    expect(result.text).not.toContain('ABCDEFGHIJKLMNOPQWXYZ')
    expect(result.text).not.toContain('sk-1234567890abcdefghij')
  })

  it('redacts private key blocks wholesale', () => {
    const result = redactText(`before
-----BEGIN RSA PRIVATE KEY-----
AAABBBCCC
-----END RSA PRIVATE KEY-----
after
`)
    expect(result.text).not.toContain('AAABBBCCC')
    expect(result.text).toContain('after')
  })
})

describe('structured values', () => {
  it('redacts deeply in objects and arrays', () => {
    const redacted = redactValue({
      providers: [{ name: 'a', token: 't0-1234567890abcdef' }],
      simple: 42,
    })
    const text = JSON.stringify(redacted)
    expect(text).not.toContain('t0-1234567890abcdef')
    expect(text).toContain('42')
    expect(text).toContain('REDACTION')
  })

  it('redactObject keeps non-secret structure identical', () => {
    const before = redactObject({ a: { b: 'c' } })
    expect(before.value).toEqual({ a: { b: 'c' } })
  })
})

describe('settings document', () => {
  it('redacts keys and auth headers in one pass deterministically', () => {
    const one = redactText(SETTINGS)
    const two = redactText(SETTINGS)
    expect(one.text).toBe(two.text)
    expect(one.fingerprint).toBe(two.fingerprint)
    expect(one.text).not.toContain('sk-ABCDEF123456789012345678')
    expect(one.text).not.toContain('m0-abcdefghijklmnop12345678')
    expect(one.fingerprint).toHaveLength(8)
  })
})

describe('anonymization', () => {
  it('replaces the home prefix with a placeholder', () => {
    expect(anonymizeHome('/u/.dsh/profiles/web/settings.yaml', '/u/.dsh')).toBe('$DSH_HOME/profiles/web/settings.yaml')
  })

  it('reports hits for redacted documents', () => {
    const result = redactText('token: abc')
    expect(result.hits.length).toBeGreaterThan(0)
  })
})

