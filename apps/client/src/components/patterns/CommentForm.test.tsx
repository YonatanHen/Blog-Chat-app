// The root vitest.config.ts declares no setupFiles, so apps/client/src/test/setup.ts
// never runs — every client test file wires jest-dom and cleanup itself, as
// apps/client/src/components/patterns/AutoForm.test.tsx does.
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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

  it('clears a fresh box once the submit has resolved', async () => {
    render(<CommentForm onSubmit={vi.fn().mockResolvedValue(undefined)} />)
    type('Posted.')
    fireEvent.click(screen.getByText('Comment', { selector: 'button' }))

    await waitFor(() => expect(screen.getByLabelText('Comment')).toHaveValue(''))
  })

  // The box is the only copy of what the reader typed. Emptying it before the
  // server answers destroys it on any 500, network drop, or expired session.
  it('KEEPS the draft when the submit fails', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('boom'))
    render(<CommentForm onSubmit={onSubmit} />)
    type('Hard-won paragraphs.')
    fireEvent.click(screen.getByText('Comment', { selector: 'button' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(screen.getByLabelText('Comment')).toHaveValue('Hard-won paragraphs.')
  })

  it('keeps the text when editing an existing comment — clearing would look like data loss', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<CommentForm onSubmit={onSubmit} initialValue="Original." submitLabel="Save" />)
    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
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
