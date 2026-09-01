/**
 * A drag-smooth range slider that decouples the visible value from the
 * external store while the user drags (issue #725).
 *
 * Binding <input type="range"> directly to a useSyncExternalStore value
 * causes two defects during drag:
 * 1. Snapping back: the store subscription re-reads the scope snapshot while
 *    the async scope.set() write is still in flight, resetting the thumb
 *    to the old value mid-drag.
 * 2. Lag and stale labels: every onChange drives a full set -> publish ->
 *    React render cycle, and the displayed number only updates once the
 *    external store settles instead of following the thumb.
 *
 * This control keeps the input effectively uncontrolled: the browser moves
 * the thumb on the compositor thread with zero React involvement while
 * dragging, onInput reports the live value (one callback per animation
 * frame) so labels update in real time, and the final value is committed to
 * the external store through the native change event, which fires once per
 * completed pointer interaction (pointer release). Keyboard-only users get
 * an explicit commit path through onBlur and the Enter/Escape keydown
 * handlers, because not every engine fires the native change event for
 * range inputs on blur or Enter (jsdom does not; behavior varies by
 * browser). A pointer cancel aborts without committing, and the external
 * value is re-synced into the DOM only while the user is neither dragging
 * nor keyboard-focusing the input.
 * @module @linxin666/dsh-client-ui-skin-center/slider-control
 */
import { useCallback, useEffect, useRef, type ReactNode } from 'react'

/** Props for the drag-smooth slider control. */
export interface SliderControlProps {
  /** External value from the store (initial value + sync target). */
  value: number
  min?: number
  max?: number
  step?: number
  /** Committed on drag end / keyboard change; callers persist to the store here. */
  onChange: (value: number) => void
  /** Live value during interaction, throttled to one callback per frame. */
  onChanging?: (value: number) => void
  className?: string
  id?: string
  ariaLabel?: string
  ariaValuetext?: string
}

/**
 * A range slider that stays smooth during drag (issue #725).
 *
 * @param props - slider props.
 * @returns the range input element.
 */
export function SliderControl({
  value: externalValue,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  onChanging,
  className,
  id,
  ariaLabel,
  ariaValuetext,
}: SliderControlProps): ReactNode {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const draggingRef = useRef(false)
  const rafRef = useRef<number | null>(null)
  const liveRef = useRef(0)
  const lastCommittedRef = useRef<number | null>(null)
  const onChangingRef = useRef(onChanging)
  onChangingRef.current = onChanging

  // Commit through the NATIVE change event (React's onChange is synthesized
  // from 'input' for range inputs, which would commit on every move). The
  // native change event fires exactly once per completed pointer interaction.
  const commitRef = useRef(onChange)
  commitRef.current = onChange

  /**
   * Persist a value to the external store, de-duplicated against the last
   * committed value so the explicit keyboard/onBlur commit paths never
   * double-fire alongside the native change event (which real browsers also
   * emit on blur or Enter for range inputs).
   */
  const commit = useCallback((value: number): void => {
    if (lastCommittedRef.current === value) return
    lastCommittedRef.current = value
    commitRef.current(value)
  }, [])

  const commitCurrent = useCallback((): void => {
    const input = inputRef.current
    if (input === null) return
    draggingRef.current = false
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    commit(Number(input.value))
  }, [commit])

  // Sync the external value into the DOM input, unless the user is dragging
  // or keyboard-focusing the input (the native change event already carries
  // the committed keyboard value; overwriting here would snap the thumb).
  useEffect(() => {
    const input = inputRef.current
    if (input !== null && !draggingRef.current && input !== input.ownerDocument.activeElement) {
      input.value = String(externalValue)
    }
  }, [externalValue])

  useEffect(() => {
    const input = inputRef.current
    if (input === null) return
    const listener = (): void => {
      draggingRef.current = false
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      commit(Number(input.value))
    }
    input.addEventListener('change', listener)
    return (): void => {
      input.removeEventListener('change', listener)
    }
  }, [commit])

  // Release the pending frame on unmount.
  useEffect(() => {
    return (): void => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  /** Throttled live-value reporter: fires onChanging at most once per frame. */
  const reportLive = useCallback((value: number): void => {
    liveRef.current = value
    if (rafRef.current !== null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      onChangingRef.current?.(liveRef.current)
    })
  }, [])

  const startDrag = useCallback(() => {
    draggingRef.current = true
  }, [])

  /** Abort the interaction (pointer cancel): no value is committed. */
  const cancelDrag = useCallback(() => {
    draggingRef.current = false
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [])

  const onInput = useCallback((event: React.FormEvent<HTMLInputElement>) => {
    reportLive(Number(event.currentTarget.value))
  }, [reportLive])

  // Commit on blur so keyboard-only users persist the value even when the
  // engine never fires the native change event for range inputs on blur.
  const commitOnBlur = useCallback((): void => {
    if (draggingRef.current) return
    commitCurrent()
  }, [commitCurrent])

  // Enter/Escape are the explicit keyboard commit keys for range inputs.
  const onKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key !== 'Enter' && event.key !== 'Escape') return
    if (draggingRef.current) return
    commitCurrent()
  }, [commitCurrent])

  return (
    <input
      ref={inputRef}
      id={id}
      className={className}
      type="range"
      min={min}
      max={max}
      step={step}
      defaultValue={externalValue}
      aria-label={ariaLabel}
      aria-valuetext={ariaValuetext}
      onPointerDown={startDrag}
      onPointerCancel={cancelDrag}
      onInput={onInput}
      onBlur={commitOnBlur}
      onKeyDown={onKeyDown}
    />
  )
}