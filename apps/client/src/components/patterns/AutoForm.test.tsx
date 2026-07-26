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

describe('AutoForm', () => {
  afterEach(() => cleanup())

  it('renders one labeled field per schema key', () => {
    render(<AutoForm schema={schema} onSubmit={vi.fn()} />)
    expect(screen.getByLabelText('title')).toBeInTheDocument()
    expect(screen.getByLabelText('draft')).toBeInTheDocument()
    expect(screen.getByLabelText('tags')).toBeInTheDocument()
  })

  it('derives the control from the schema type, not the field name', () => {
    render(<AutoForm schema={schema} onSubmit={vi.fn()} />)
    expect(screen.getByLabelText('draft')).toHaveAttribute('type', 'checkbox')
    expect(screen.getByLabelText('tags')).toHaveAttribute('type', 'text')
  })

  // `.partial()` wraps every field in ZodOptional *outside* the ZodDefault that
  // `z.array(...).default([])` already added, so a single-level unwrap reports
  // `tags` as a plain string field and the comma-split never runs.
  it('still derives field kinds through a .partial() schema', () => {
    const onSubmit = vi.fn()
    render(<AutoForm schema={schema.partial()} onSubmit={onSubmit} />)
    expect(screen.getByLabelText('draft')).toHaveAttribute('type', 'checkbox')

    fireEvent.change(screen.getByLabelText('tags'), { target: { value: 'express, testing' } })
    fireEvent.change(screen.getByLabelText('title'), { target: { value: 'A valid title' } })
    fireEvent.click(screen.getByText('Save'))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ tags: ['express', 'testing'] }))
  })

  it('shows the schema error message and does not call onSubmit for invalid input', () => {
    const onSubmit = vi.fn()
    render(<AutoForm schema={schema} onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText('title'), { target: { value: 'ab' } })
    fireEvent.click(screen.getByText('Save'))
    expect(screen.getByText('Title must be at least 3 characters')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('parses a comma-separated tags input into a string array on submit', () => {
    const onSubmit = vi.fn()
    render(<AutoForm schema={schema} onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText('title'), { target: { value: 'A valid title' } })
    fireEvent.change(screen.getByLabelText('tags'), { target: { value: 'express, testing' } })
    fireEvent.click(screen.getByText('Save'))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'A valid title', tags: ['express', 'testing'] }),
    )
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
    expect(screen.getByLabelText('title')).toHaveValue('Seeded')
    expect(screen.getByLabelText('draft')).toBeChecked()
    expect(screen.getByLabelText('tags')).toHaveValue('a, b')
    expect(screen.getByText('Save changes')).toBeInTheDocument()
  })
})
