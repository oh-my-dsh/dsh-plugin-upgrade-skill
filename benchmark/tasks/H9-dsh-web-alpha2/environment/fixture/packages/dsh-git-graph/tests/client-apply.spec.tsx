// @vitest-environment jsdom
/**
 * Client apply() registration tests: declaration-aware mount with a dock
 * fallback. The chip registers on the selector row's context hole
 * (`conversation.input.selector.context`, session-maybe) when the shell
 * declares it, and falls back to `conversation.input.dock` when that
 * declaration never arrives within CONTEXT_FALLBACK_MS (rc.6 and the current
 * shipped shell dropped the hole). Guards the 0be6546 regression (the inject
 * wait that never resolved) and the double-mount hazard: exactly one seat
 * registers, and a context declaration landing after the fallback is ignored.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apply, CONTEXT_FALLBACK_MS } from '../src/client/index.ts'
import { BranchChip } from '../src/client/chips/BranchChip.tsx'

/**
 * A minimal SlotRegistry stand-in: inject resolves synchronously for
 * declared slots and otherwise parks the callback until a declaration
 * lands (mirroring the service's declaration-lifetime semantics).
 */
function makeSlotSystem(declared: Set<string>) {
  const register = vi.fn(() => () => undefined)
  const pending = new Map<string, () => () => void>()
  const inject = vi.fn((name: string, callback: () => () => void) => {
    if (declared.has(name)) {
      callback()
      return () => undefined
    }
    pending.set(name, callback)
    return () => { pending.delete(name) }
  })
  /** A declaration lands: run the parked wait for the name, if any. */
  const declare = (name: string): void => {
    const callback = pending.get(name)
    if (callback !== undefined) {
      pending.delete(name)
      callback()
    }
  }
  return { register, inject, declare }
}

/** Assemble the ctx/scope stubs, run apply, and hand back the instruments. */
function setup(declared: Set<string>) {
  const slotSystem = makeSlotSystem(declared)
  const disposers: (() => void)[] = []
  const scope = {
    slots: slotSystem,
    conversation: {},
    sessions: { list: { getSnapshot: () => ({ byId: {} }) } },
    // The auto-isolation fiber wraps this stub's startSession; the probe
    // members must exist so install takes the realistic path.
    workspaces: {
      startSession: vi.fn(),
      create: vi.fn(),
      connectWorkspace: vi.fn(),
      list: { getSnapshot: () => ({ items: [] }) },
    },
    effect: vi.fn((fn: () => unknown) => {
      const dispose = fn()
      if (typeof dispose === 'function') disposers.push(dispose as () => void)
      return () => {}
    }),
  }
  const ctx = {
    effect: vi.fn((fn: () => unknown) => {
      const dispose = fn()
      if (typeof dispose === 'function') disposers.push(dispose as () => void)
      return () => {}
    }),
    locale: { register: vi.fn() },
    inject: vi.fn((_services: unknown, callback: (s: typeof scope) => void) => { callback(scope) }),
  }

  apply(ctx as never)
  return { ...slotSystem, ctx, disposers }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('client apply()', () => {
  it('registers on the selector-context hole when the shell declares it', () => {
    const { register, inject, disposers } = setup(new Set(['conversation.input.selector.context']))

    // The declaration is already live, so the inject wait resolves
    // synchronously and the chip registers on the context hole.
    expect(inject).toHaveBeenCalledWith('conversation.input.selector.context', expect.any(Function))
    expect(register).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'conversation.input.selector.context',
        id: 'git-graph',
        order: 100,
      }),
      BranchChip,
    )

    // Past the fallback deadline the mounted chip stays where it is: no
    // second registration, nothing on the dock.
    vi.advanceTimersByTime(CONTEXT_FALLBACK_MS + 100)
    expect(register).toHaveBeenCalledTimes(1)
    expect(register).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: 'conversation.input.dock' }),
      expect.anything(),
    )

    for (const dispose of disposers) dispose()
  })

  it('mounts the context hole when the declaration lands before the deadline', () => {
    const { register, declare, disposers } = setup(new Set())

    vi.advanceTimersByTime(CONTEXT_FALLBACK_MS / 2)
    declare('conversation.input.selector.context')
    expect(register).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'conversation.input.selector.context' }),
      BranchChip,
    )

    // The fallback deadline passes with the chip already mounted: no dock.
    vi.advanceTimersByTime(CONTEXT_FALLBACK_MS)
    expect(register).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: 'conversation.input.dock' }),
      expect.anything(),
    )

    for (const dispose of disposers) dispose()
  })

  it('falls back to the input dock when the context hole is never declared', () => {
    const { register, disposers } = setup(new Set(['conversation.input.dock']))

    // While the grace window runs the chip waits on the missing hole.
    vi.advanceTimersByTime(CONTEXT_FALLBACK_MS - 100)
    expect(register).not.toHaveBeenCalled()

    vi.advanceTimersByTime(200)
    expect(register).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'conversation.input.dock',
        id: 'git-graph',
        order: 100,
      }),
      BranchChip,
    )
    expect(register).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: 'conversation.input.selector.context' }),
      expect.anything(),
    )

    for (const dispose of disposers) dispose()
  })

  it('ignores a context declaration arriving after the dock fallback (no double mount)', () => {
    const { register, declare, disposers } = setup(new Set(['conversation.input.dock']))

    vi.advanceTimersByTime(CONTEXT_FALLBACK_MS + 100)
    expect(register).toHaveBeenCalledTimes(1)

    // The fallback disposed the context wait, so a late declaration runs no
    // parked callback: the dock seat stays the only registration.
    declare('conversation.input.selector.context')
    expect(register).toHaveBeenCalledTimes(1)
    expect(register).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'conversation.input.dock' }),
      BranchChip,
    )

    for (const dispose of disposers) dispose()
  })
})
