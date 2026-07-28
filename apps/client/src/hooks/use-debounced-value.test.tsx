import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useDebouncedValue } from './use-debounced-value.js'

describe('useDebouncedValue', () => {
  afterEach(() => vi.useRealTimers())

  it('returns the initial value immediately', () => {
    const { result } = renderHook(() => useDebouncedValue('mongo', 300))
    expect(result.current).toBe('mongo')
  })

  it('withholds a new value until the delay has elapsed', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), {
      initialProps: { value: 'a' },
    })

    rerender({ value: 'ab' })
    act(() => void vi.advanceTimersByTime(299))
    expect(result.current).toBe('a')

    act(() => void vi.advanceTimersByTime(1))
    expect(result.current).toBe('ab')
  })

  // The point of the hook: a keystroke mid-wait restarts the clock, so a burst
  // settles on the last value once and never emits the intermediate ones.
  it('restarts the timer on a rapid second change instead of firing twice', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), {
      initialProps: { value: 'a' },
    })

    rerender({ value: 'ab' })
    act(() => void vi.advanceTimersByTime(200))
    rerender({ value: 'abc' })

    // 200ms after the FIRST change had it not been reset — still nothing.
    act(() => void vi.advanceTimersByTime(200))
    expect(result.current).toBe('a')

    act(() => void vi.advanceTimersByTime(100))
    expect(result.current).toBe('abc')
  })
})
