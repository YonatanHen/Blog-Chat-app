import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MarkdownPreview } from './MarkdownPreview.js'

describe('MarkdownPreview', () => {
  afterEach(() => cleanup())

  it('renders Markdown as elements, not as text', () => {
    render(<MarkdownPreview source={'# Heading\n\nSome **bold** text.'} />)
    expect(screen.getByRole('heading', { name: 'Heading' })).toBeInTheDocument()
    expect(screen.getByText('bold').tagName).toBe('STRONG')
  })

  it('supports GFM tables and strikethrough', () => {
    render(<MarkdownPreview source={'| a | b |\n| - | - |\n| 1 | 2 |\n\n~~gone~~'} />)
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByText('gone').tagName).toBe('DEL')
  })

  // THE security test. rehype-raw is deliberately not installed, so raw HTML in
  // the source is inert text — never a node the browser will execute. If someone
  // adds rehype-raw to "support a little HTML", this fails, which is the point.
  it('never turns a <script> in the source into a script element', () => {
    const { container } = render(
      <MarkdownPreview source={'Hello <script>alert(1)</script> world'} />,
    )
    expect(container.querySelector('script')).toBeNull()
    // And it survived as visible text rather than silently vanishing.
    expect(container.textContent).toContain('alert(1)')
  })

  it('does not execute an img onerror handler smuggled through as HTML', () => {
    const { container } = render(
      <MarkdownPreview source={'<img src="x" onerror="alert(1)" />'} />,
    )
    expect(container.querySelector('img')).toBeNull()
  })

  it('does not render an iframe smuggled through as HTML', () => {
    const { container } = render(<MarkdownPreview source={'<iframe src="evil"></iframe>'} />)
    expect(container.querySelector('iframe')).toBeNull()
  })
})
