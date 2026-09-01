import { describe, expect, it } from 'vitest'
import { classifyStaleTail, classifyStepTail, type TailNodeView } from '../src/client/perf-integrity.ts'

describe('classifyStepTail', () => {
  it('flags a settled assistant-step without finalNode', () => {
    const node: TailNodeView = { kind: 'assistant-step', anchorSeq: 10, data: { status: 'settled', turn: 1, step: 1 } }
    expect(classifyStepTail(node)).toBe('final-node-missing')
  })

  it('accepts a settled step with finalNode', () => {
    const node: TailNodeView = { kind: 'assistant-step', anchorSeq: 10, data: { status: 'settled', finalNode: { seq: 12 }, turn: 1, step: 1 } }
    expect(classifyStepTail(node)).toBeNull()
  })

  it('ignores running steps and non-assistant nodes', () => {
    expect(classifyStepTail({ kind: 'assistant-step', data: { status: 'running' } })).toBeNull()
    expect(classifyStepTail({ kind: 'user', data: {} })).toBeNull()
    expect(classifyStepTail(undefined)).toBeNull()
  })
})

describe('classifyStaleTail', () => {
  it('flags a host assistant/message tail newer than the last visible node', () => {
    expect(classifyStaleTail({ seq: 99, type: 'assistant/message' }, { anchorSeq: 90, kind: 'turn-tail' })).toBe('stale-tail')
  })

  it('accepts a host tail at or below the last visible node', () => {
    expect(classifyStaleTail({ seq: 90, type: 'assistant/message' }, { anchorSeq: 90, kind: 'turn-tail' })).toBeNull()
    expect(classifyStaleTail({ seq: 89, type: 'assistant/message' }, { anchorSeq: 90, kind: 'turn-tail' })).toBeNull()
  })

  it('ignores non-message tails and missing sequences', () => {
    expect(classifyStaleTail({ seq: 99, type: 'turn/end' }, { anchorSeq: 90, kind: 'turn-tail' })).toBeNull()
    expect(classifyStaleTail({ type: 'assistant/message' }, { anchorSeq: 90, kind: 'turn-tail' })).toBeNull()
    expect(classifyStaleTail(undefined, { anchorSeq: 90, kind: 'turn-tail' })).toBeNull()
    expect(classifyStaleTail({ seq: 99, type: 'assistant/message' }, undefined)).toBeNull()
  })
})
