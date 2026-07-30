// The root vitest.config.ts declares no setupFiles, so apps/client/src/test/setup.ts
// never runs — every client test file wires jest-dom and cleanup itself, as
// apps/client/src/components/patterns/PostCard.test.tsx does.
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SearchBar } from './SearchBar.js'

describe('SearchBar', () => {
  afterEach(() => cleanup())

  it('renders the current value — the term always comes from the owner', () => {
    render(<SearchBar value="mongo" onChange={vi.fn()} />)
    expect(screen.getByRole('searchbox', { name: /search posts/i })).toHaveValue('mongo')
  })

  it('forwards typed input to onChange', () => {
    const onChange = vi.fn()
    render(<SearchBar value="" onChange={onChange} />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'mongo' } })
    expect(onChange).toHaveBeenCalledWith('mongo')
  })

  // Controlled, not self-updating: without a parent applying the change the box
  // stays empty, which is what lets the feed keep the term in the URL.
  it('does not update itself when the value prop does not change', () => {
    render(<SearchBar value="" onChange={vi.fn()} />)
    const input = screen.getByRole('searchbox')
    fireEvent.change(input, { target: { value: 'mongo' } })
    expect(input).toHaveValue('')
  })

  it('stays labelled for assistive tech without showing a visible label', () => {
    render(<SearchBar value="" onChange={vi.fn()} />)
    expect(screen.getByLabelText('Search posts')).toBeInTheDocument()
  })
})
