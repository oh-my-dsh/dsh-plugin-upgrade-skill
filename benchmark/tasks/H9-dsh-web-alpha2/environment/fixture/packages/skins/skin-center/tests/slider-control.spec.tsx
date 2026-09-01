// @vitest-environment jsdom
/**
 * SliderControl behavior guards (issue #725): the visible value must follow
 * the thumb without snapping back mid-drag, the live label updates once per
 * frame, and the external store receives exactly one committed value per
 * completed interaction (pointer release or keyboard) — never on pointer
 * cancel.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { SliderControl } from '../src/client/SliderControl.tsx'

;((globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT) = true

let root: Root
let host: HTMLDivElement

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => { root.unmount() })
  host.remove()
})

const range = (): HTMLInputElement => {
  const input = host.querySelector('input[type="range"]')
  if (input === null) throw new Error('range input not rendered')
  return input
}

const fire = (input: HTMLInputElement, type: string): void => {
  input.dispatchEvent(new Event(type, { bubbles: true }))
}

/** Let the throttled live reporter flush its animation frame. */
const flushRaf = (): Promise<void> =>
  new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve())
    } else {
      resolve()
    }
  })

describe('SliderControl', () => {
  it('reports live values during drag and commits once on the change event (#725)', async () => {
    const onChange = vi.fn()
    const onChanging = vi.fn()
    act(() => {
      root.render(<SliderControl value={50} min={0} max={100} step={5} onChange={onChange} onChanging={onChanging} ariaLabel="dim" />)
    })
    const input = range()
    act(() => { fire(input, 'pointerdown') })
    act(() => {
      input.value = '55'
      fire(input, 'input')
    })
    await act(async () => { await flushRaf() })
    expect(onChanging).toHaveBeenLastCalledWith(55)
    expect(onChange).not.toHaveBeenCalled()
    act(() => { fire(input, 'change') })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(55)
  })

  it('does not commit on pointer cancel and stays usable afterwards (#725)', () => {
    const onChange = vi.fn()
    act(() => {
      root.render(<SliderControl value={50} onChange={onChange} ariaLabel="dim" />)
    })
    const input = range()
    act(() => { fire(input, 'pointerdown') })
    act(() => {
      input.value = '75'
      fire(input, 'input')
    })
    act(() => { fire(input, 'pointercancel') })
    expect(onChange).not.toHaveBeenCalled()
    act(() => { fire(input, 'change') })
    expect(onChange).toHaveBeenCalledWith(75)
  })

  it('does not snap the thumb when the external value changes mid-drag (#725)', () => {
    const onChange = vi.fn()
    act(() => {
      root.render(<SliderControl value={50} onChange={onChange} ariaLabel="dim" />)
    })
    const input = range()
    expect(input.value).toBe('50')
    act(() => { fire(input, 'pointerdown') })
    act(() => {
      input.value = '70'
      fire(input, 'input')
    })
    act(() => {
      root.render(<SliderControl value={80} onChange={onChange} ariaLabel="dim" />)
    })
    // Mid-drag: the external value must not overwrite the DOM value.
    expect(input.value).toBe('70')
    act(() => { fire(input, 'change') })
    expect(onChange).toHaveBeenCalledWith(70)
  })

  it('syncs the external value back once the interaction is over (#725)', () => {
    const onChange = vi.fn()
    const Harness = ({ value }: { value: number }) => (
      <SliderControl value={value} onChange={onChange} ariaLabel="dim" />
    )
    act(() => {
      root.render(<Harness value={50} />)
    })
    const input = range()
    act(() => { fire(input, 'pointerdown') })
    act(() => {
      input.value = '70'
      fire(input, 'input')
    })
    act(() => { fire(input, 'change') })
    act(() => {
      root.render(<Harness value={80} />)
    })
    expect(input.value).toBe('80')
  })

  it('commits keyboard interaction through the change event (#725)', async () => {
    const onChange = vi.fn()
    const onChanging = vi.fn()
    act(() => {
      root.render(<SliderControl value={20} onChange={onChange} onChanging={onChanging} ariaLabel="blur" />)
    })
    const input = range()
    act(() => { input.focus() })
    act(() => {
      input.value = '24'
      fire(input, 'input')
    })
    await act(async () => { await flushRaf() })
    expect(onChanging).toHaveBeenCalledWith(24)
    act(() => { fire(input, 'change') })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(24)
  })

  it('does not commit on pointerleave mid-drag and commits on the eventual release (#725)', () => {
    const onChange = vi.fn()
    const Harness = ({ value }: { value: number }) => (
      <SliderControl value={value} onChange={onChange} ariaLabel="dim" />
    )
    act(() => {
      root.render(<Harness value={50} />)
    })
    const input = range()
    act(() => { fire(input, 'pointerdown') })
    act(() => {
      input.value = '62'
      fire(input, 'input')
    })
    // Pointer leaving mid-drag must neither abort the interaction nor
    // commit prematurely: the drag stays active and the external value is
    // still not allowed to overwrite the DOM value.
    act(() => { fire(input, 'pointerleave') })
    expect(onChange).not.toHaveBeenCalled()
    act(() => {
      root.render(<Harness value={80} />)
    })
    expect(input.value).toBe('62')
    // The release commits the dragged value exactly once.
    act(() => { fire(input, 'change') })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(62)
  })

  it('commits the keyboard value when the input loses focus (onBlur) (#725)', async () => {
    const onChange = vi.fn()
    const onChanging = vi.fn()
    act(() => {
      root.render(<SliderControl value={20} onChange={onChange} onChanging={onChanging} ariaLabel="blur" />)
    })
    const input = range()
    act(() => { input.focus() })
    act(() => {
      input.value = '34'
      fire(input, 'input')
    })
    await act(async () => { await flushRaf() })
    expect(onChanging).toHaveBeenLastCalledWith(34)
    expect(onChange).not.toHaveBeenCalled()
    act(() => { input.blur() })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(34)
  })

  it('commits the keyboard value on the Enter key (#725)', () => {
    const onChange = vi.fn()
    act(() => {
      root.render(<SliderControl value={20} onChange={onChange} ariaLabel="dim" />)
    })
    const input = range()
    act(() => { input.focus() })
    act(() => {
      input.value = '41'
      fire(input, 'input')
    })
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(41)
  })

  it('commits the keyboard value on the Escape key (#725)', () => {
    const onChange = vi.fn()
    act(() => {
      root.render(<SliderControl value={20} onChange={onChange} ariaLabel="dim" />)
    })
    const input = range()
    act(() => { input.focus() })
    act(() => {
      input.value = '41'
      fire(input, 'input')
    })
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(41)
  })

  it('does not double-commit when the native change event follows a keyboard commit (#725)', () => {
    const onChange = vi.fn()
    act(() => {
      root.render(<SliderControl value={20} onChange={onChange} ariaLabel="dim" />)
    })
    const input = range()
    act(() => { input.focus() })
    act(() => {
      input.value = '30'
      fire(input, 'input')
    })
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(30)
    // Real browsers also emit the native change event after Enter; the
    // de-duplication must keep this a single commit.
    act(() => { fire(input, 'change') })
    expect(onChange).toHaveBeenCalledTimes(1)
  })
})
