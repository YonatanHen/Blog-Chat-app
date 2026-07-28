import { useId } from 'react'
import { Input } from '../ui/input.js'

/**
 * A controlled search box and nothing more — no state, no debounce, no request.
 * The owner decides what a term means and when to act on it; keeping this dumb
 * is what lets the feed hold the term in the URL rather than in a component.
 *
 * `type="search"` gives the browser's clear affordance, and the label is
 * visually hidden rather than absent so the input is still named for
 * screen readers without a heading above the feed.
 */
export function SearchBar({
  value,
  onChange,
  id,
  label = 'Search posts',
  placeholder = 'Search posts…',
}: {
  value: string
  onChange: (value: string) => void
  id?: string
  label?: string
  placeholder?: string
}) {
  // Two search bars on one page must not share an id, or the second label
  // points at the first input. A caller can still pin the id if it needs to.
  const generatedId = useId()
  const inputId = id ?? generatedId

  return (
    <div>
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      <Input
        id={inputId}
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
