// The root vitest.config.ts declares no setupFiles, so apps/client/src/test/setup.ts
// never runs — every client test file wires jest-dom and cleanup itself, as
// apps/client/src/components/patterns/AutoForm.test.tsx does.
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CommentForm } from './CommentForm.js'

const type = (value: string) =>
  fireEvent.change(screen.getByLabelText('Comment'), { target: { value } })

describe('CommentForm', () => {
  afterEach(() => cleanup())

  it('hands onSubmit the PARSED body, trimmed by the shared schema', () => {
    const onSubmit = vi.fn()
    render(<CommentForm onSubmit={onSubmit} />)

    type('  Nice post.  ')
    fireEvent.click(screen.getByText('Comment', { selector: 'button' }))

    expect(onSubmit).toHaveBeenCalledWith('Nice post.')
  })

  it('blocks an empty comment and shows the schema message inline', () => {
    const onSubmit = vi.fn()
    render(<CommentForm onSubmit={onSubmit} />)

    type('   ')
    fireEvent.click(screen.getByText('Comment', { selector: 'button' }))

    expect(onSubmit).not.toHaveBeenCalled()
    // The message comes from CreateCommentSchema, not from a string duplicated here.
    expect(screen.getByText('Comment cannot be empty')).toBeInTheDocument()
  })

  it('renders the draft as Markdown once Preview is selected', () => {
    render(<CommentForm onSubmit={vi.fn()} />)
    type('# Heading')
    fireEvent.click(screen.getByRole('tab', { name: 'Preview' }))

    expect(screen.getByRole('heading', { name: 'Heading' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Comment')).not.toBeInTheDocument()
  })

  it('keeps the draft when switching back to Write', () => {
    render(<CommentForm onSubmit={vi.fn()} />)
    type('draft text')
    fireEvent.click(screen.getByRole('tab', { name: 'Preview' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Write' }))

    expect(screen.getByLabelText('Comment')).toHaveValue('draft text')
  })

  it('never previews raw HTML as a live element', () => {
    const { container } = render(<CommentForm onSubmit={vi.fn()} />)
    type('<script>alert(1)</script>')
    fireEvent.click(screen.getByRole('tab', { name: 'Preview' }))

    expect(container.querySelector('script')).toBeNull()
  })

  it('clears a fresh box after a successful submit', () => {
    render(<CommentForm onSubmit={vi.fn()} />)
    type('Posted.')
    fireEvent.click(screen.getByText('Comment', { selector: 'button' }))

    expect(screen.getByLabelText('Comment')).toHaveValue('')
  })

  it('keeps the text when editing an existing comment — clearing would look like data loss', () => {
    render(<CommentForm onSubmit={vi.fn()} initialValue="Original." submitLabel="Save" />)
    fireEvent.click(screen.getByText('Save'))

    expect(screen.getByLabelText('Comment')).toHaveValue('Original.')
  })

  it('shows Cancel only when the caller can handle it', () => {
    const onCancel = vi.fn()
    const { rerender } = render(<CommentForm onSubmit={vi.fn()} />)
    expect(screen.queryByText('Cancel')).not.toBeInTheDocument()

    rerender(<CommentForm onSubmit={vi.fn()} onCancel={onCancel} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(onCancel).toHaveBeenCalled()
  })
})
