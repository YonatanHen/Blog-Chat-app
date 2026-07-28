import { useEffect, useState } from 'react'

/**
 * Returns `value` only once it has stopped changing for `delay` ms.
 *
 * The timer is cleaned up on every change, so a burst of edits resets it rather
 * than queueing one expiry each — typing "mongo" issues one request, not five.
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}
