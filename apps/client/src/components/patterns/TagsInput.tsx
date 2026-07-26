import { useState, type KeyboardEvent } from 'react'
import { Input } from '../ui/input.js'

/**
 * Tags are entered one at a time and shown as removable chips. The previous
 * control was a plain text box whose comma-separated contract was invisible —
 * nothing on screen said "split these with a comma", so tags arrived as one
 * long tag. Enter commits, the hint states that, and the chips make the parsed
 * result visible before submit instead of after.
 */
export function TagsInput({
  id,
  value,
  onChange,
}: {
  id: string
  value: string[]
  onChange: (tags: string[]) => void
}) {
  const [draft, setDraft] = useState('')
  const hintId = `${id}-hint`

  function commit() {
    const tag = draft.trim()
    if (!tag) return
    // Duplicates would survive the schema and reach the post, so drop them here.
    if (!value.includes(tag)) onChange([...value, tag])
    setDraft('')
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      // Without this the keypress submits the surrounding form instead.
      e.preventDefault()
      commit()
      return
    }
    if (e.key === 'Backspace' && draft === '' && value.length > 0) {
      onChange(value.slice(0, -1))
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Input
        id={id}
        type="text"
        value={draft}
        aria-describedby={hintId}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      <p id={hintId} className="text-sm text-[var(--muted-foreground)]">
        Type a tag and press Enter to add it.
      </p>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {value.map((tag) => (
            <li
              key={tag}
              className="flex items-center gap-1 rounded-full border border-[var(--border)] px-3 py-1 text-sm"
            >
              {tag}
              <button
                type="button"
                aria-label={`Remove tag ${tag}`}
                className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                onClick={() => onChange(value.filter((t) => t !== tag))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
