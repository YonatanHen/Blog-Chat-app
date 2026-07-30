import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Button } from './button.js'

describe('Button', () => {
  afterEach(() => cleanup())
  it('renders its children and forwards onClick', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Save</Button>)
    screen.getByText('Save').click()
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('is disabled and non-interactive when disabled is set', () => {
    render(<Button disabled>Save</Button>)
    expect(screen.getByText('Save')).toBeDisabled()
  })

  it('applies the destructive variant class', () => {
    render(<Button variant="destructive">Delete</Button>)
    expect(screen.getByText('Delete').className).toContain('bg-[var(--destructive)]')
  })
})
