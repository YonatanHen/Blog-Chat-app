import { useState, type FormEvent } from 'react'
import { CreateCommentSchema } from '@blog/zod-shared'
import { Button } from '../ui/button.js'
import { Textarea } from '../ui/textarea.js'
import { MarkdownPreview } from './MarkdownPreview.js'

type Mode = 'write' | 'preview'

/**
 * The comment composer. Not built on AutoForm on purpose: AutoForm renders one
 * control per schema key, which cannot hide `parent` (a reply still has to send
 * it) and has nowhere to put a Write/Preview toggle. What it does reuse is
 * AutoForm's contract — validate against the shared schema, show the first Zod
 * issue inline, and hand `onSubmit` the PARSED value, never the raw textarea
 * string. So the rule the server enforces and the rule the form enforces are
 * the same one, in @blog/zod-shared.
 */
export function CommentForm({
  onSubmit,
  initialValue = '',
  submitLabel = 'Comment',
  isPending = false,
  onCancel,
  autoFocus = false,
}: {
  onSubmit: (body: string) => void | Promise<unknown>
  initialValue?: string
  submitLabel?: string
  isPending?: boolean
  onCancel?: () => void
  autoFocus?: boolean
}) {
  const [body, setBody] = useState(initialValue)
  const [mode, setMode] = useState<Mode>('write')
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    // Only the `body` field: `parent` is decided by which reply box this is, not
    // by anything the user typed, so it is never part of what gets validated here.
    const result = CreateCommentSchema.shape.body.safeParse(body)
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? 'Invalid comment.')
      return
    }
    setError(null)

    // Emptied only once the submit has actually SUCCEEDED. `onSubmit` fires a
    // mutation, so clearing synchronously would throw away paragraphs of the
    // reader's text the moment the request 500s or the session has expired —
    // and the toast that follows offers no way to get them back.
    // The rejection is swallowed on purpose: the caller already reports it, and
    // all this handler needs to know is "do not clear".
    void Promise.resolve(onSubmit(result.data)).then(
      () => {
        // Not when the form is seeded with existing text: on an edit, an empty
        // box would read as data loss rather than as a fresh composer.
        if (!initialValue) setBody('')
      },
      () => {},
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <div role="tablist" aria-label="Comment editor" className="flex gap-2 text-sm">
        {(['write', 'preview'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={mode === tab}
            onClick={() => setMode(tab)}
            className={
              mode === tab
                ? 'rounded px-2 py-1 font-medium text-[var(--primary)] underline'
                : 'rounded px-2 py-1 text-[var(--muted-foreground)]'
            }
          >
            {tab === 'write' ? 'Write' : 'Preview'}
          </button>
        ))}
      </div>

      {mode === 'write' ? (
        <Textarea
          aria-label="Comment"
          placeholder="Write a comment — Markdown supported"
          value={body}
          autoFocus={autoFocus}
          onChange={(e) => setBody(e.target.value)}
        />
      ) : (
        <div
          role="tabpanel"
          className="min-h-32 border border-[var(--border)] p-3 text-sm"
        >
          {body.trim() ? (
            <MarkdownPreview source={body} />
          ) : (
            <p className="text-[var(--muted-foreground)]">Nothing to preview yet.</p>
          )}
        </div>
      )}

      {error && <p className="text-sm text-[var(--destructive)]">{error}</p>}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isPending}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  )
}
