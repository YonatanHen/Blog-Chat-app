// The root vitest.config.ts declares no setupFiles, so apps/client/src/test/setup.ts
// never runs — every client test file wires jest-dom and cleanup itself, as
// apps/client/src/components/patterns/PostCard.test.tsx does.
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { AutoForm } from './AutoForm.js'

const schema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters'),
  draft: z.coerce.boolean().default(false),
  tags: z.array(z.string()).default([]),
})

function addTag(tag: string) {
  const input = screen.getByLabelText('Tags')
  fireEvent.change(input, { target: { value: tag } })
  fireEvent.keyDown(input, { key: 'Enter' })
}

describe('AutoForm', () => {
  afterEach(() => cleanup())

  it('renders one labeled field per schema key', () => {
    render(<AutoForm schema={schema} onSubmit={vi.fn()} />)
    expect(screen.getByLabelText('Title')).toBeInTheDocument()
    expect(screen.getByLabelText('Draft')).toBeInTheDocument()
    expect(screen.getByLabelText('Tags')).toBeInTheDocument()
  })

  it('derives the control from the schema type, not the field name', () => {
    render(<AutoForm schema={schema} onSubmit={vi.fn()} />)
    expect(screen.getByLabelText('Draft')).toHaveAttribute('type', 'checkbox')
    expect(screen.getByLabelText('Tags')).toHaveAttribute('type', 'text')
  })

  // `.partial()` wraps every field in ZodOptional *outside* the ZodDefault that
  // `z.array(...).default([])` already added, so a single-level unwrap reports
  // `tags` as a plain string field and it renders as a bare text box.
  it('still derives field kinds through a .partial() schema', () => {
    const onSubmit = vi.fn()
    render(<AutoForm schema={schema.partial()} onSubmit={onSubmit} />)
    expect(screen.getByLabelText('Draft')).toHaveAttribute('type', 'checkbox')

    addTag('express')
    addTag('testing')
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'A valid title' } })
    fireEvent.click(screen.getByText('Save'))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ tags: ['express', 'testing'] }))
  })

  it('shows the schema error message and does not call onSubmit for invalid input', () => {
    const onSubmit = vi.fn()
    render(<AutoForm schema={schema} onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'ab' } })
    fireEvent.click(screen.getByText('Save'))
    expect(screen.getByText('Title must be at least 3 characters')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits the tags added one at a time as a string array', () => {
    const onSubmit = vi.fn()
    render(<AutoForm schema={schema} onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'A valid title' } })
    addTag('express')
    addTag('testing')
    expect(screen.getByText('express')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Save'))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'A valid title', tags: ['express', 'testing'] }),
    )
  })

  it('drops a tag removed with its × button', () => {
    const onSubmit = vi.fn()
    render(<AutoForm schema={schema} onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'A valid title' } })
    addTag('keep')
    addTag('drop')
    fireEvent.click(screen.getByLabelText('Remove tag drop'))
    fireEvent.click(screen.getByText('Save'))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ tags: ['keep'] }))
  })

  it('submits a blank optional field as absent, not empty, so it never fails a value-only check like min-length', () => {
    const onSubmit = vi.fn()
    const withOptionalPassword = schema.extend({
      password: z.string().min(8, 'Password must be at least 8 characters').optional(),
    })
    render(<AutoForm schema={withOptionalPassword} onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'A valid title' } })
    fireEvent.click(screen.getByText('Save'))
    expect(screen.queryByText('Password must be at least 8 characters')).not.toBeInTheDocument()
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ password: undefined }))
  })

  it('seeds the form from initialValues', () => {
    render(
      <AutoForm
        schema={schema}
        initialValues={{ title: 'Seeded', draft: true, tags: ['a', 'b'] }}
        onSubmit={vi.fn()}
        submitLabel="Save changes"
      />,
    )
    expect(screen.getByLabelText('Title')).toHaveValue('Seeded')
    expect(screen.getByLabelText('Draft')).toBeChecked()
    expect(screen.getByText('a')).toBeInTheDocument()
    expect(screen.getByText('b')).toBeInTheDocument()
    expect(screen.getByLabelText('Tags')).toHaveValue('')
    expect(screen.getByText('Save changes')).toBeInTheDocument()
  })
})
