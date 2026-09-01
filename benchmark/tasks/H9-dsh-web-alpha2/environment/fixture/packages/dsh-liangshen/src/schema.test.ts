import { describe, expect, it } from 'vitest'
import { validateAgentCordis } from './schema.ts'

const VALID = [
  "- id: persona",
  "  name: '@deepseek-ai/dsh-persona'",
  "- id: bootstrap",
  "  name: ./tool-bootstrap.mjs",
  "- id: shell-group",
  "  name: cordis:group",
  "  group: true",
  "  isolate:",
  "    terminals: true",
  "  config:",
  "    - id: pty",
  "      name: '@deepseek-ai/dsh-terminal'",
].join('\n')

describe('validateAgentCordis', () => {
  it('accepts a well-formed preset document', () => {
    expect(validateAgentCordis(VALID)).toEqual([])
  })

  it('rejects an empty document', () => {
    expect(validateAgentCordis('')).not.toEqual([])
    expect(validateAgentCordis('\n  \n')).not.toEqual([])
  })

  it('rejects a document that is not a list of rows', () => {
    expect(validateAgentCordis('rows: []\n')).not.toEqual([])
  })

  it('rejects a row without a name', () => {
    const doc = "- id: persona\n  group: true\n"
    expect(validateAgentCordis(doc)).not.toEqual([])
  })

  it('rejects a row whose name starts with an unsupported prefix', () => {
    const doc = "- id: bad\n  name: 'plain-text'\n"
    expect(validateAgentCordis(doc)).not.toEqual([])
  })

  it('rejects duplicate row ids', () => {
    const doc = [
      "- id: persona",
      "  name: '@deepseek-ai/dsh-persona'",
      "- id: persona",
      "  name: '@deepseek-ai/dsh-tool-todo'",
    ].join('\n')
    const errors = validateAgentCordis(doc)
    expect(errors.some(error => error.includes('duplicate row id'))).toBe(true)
  })

  it('rejects a group-true row that does not use cordis:group', () => {
    const doc = "- id: shell-group\n  name: '@deepseek-ai/dsh-persona'\n  group: true\n"
    expect(validateAgentCordis(doc)).not.toEqual([])
  })

  it('rejects a row with a blank id', () => {
    const doc = "- id:  \n"
    const errors = validateAgentCordis(doc)
    expect(errors.some(error => error.includes('empty row id'))).toBe(true)
  })
})
