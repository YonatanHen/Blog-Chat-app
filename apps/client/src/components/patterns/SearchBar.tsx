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
  id = 'search',
  label = 'Search posts',
  placeholder = 'Search posts…',
}: {
  value: string
  onChange: (value: string) => void
  id?: string
  label?: string
  placeholder?: string
}) {
  return (
    <div>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Input
        id={id}
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
