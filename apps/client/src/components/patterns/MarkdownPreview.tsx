import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * Renders untrusted Markdown.
 *
 * `rehype-raw` is deliberately absent. Without it react-markdown never parses
 * embedded HTML into nodes, so a `<script>` (or an `onerror` attribute, or an
 * `<iframe>`) in a comment body arrives as literal text and is escaped on the
 * way into the DOM. Adding rehype-raw to "support a bit of HTML" would turn
 * every comment box in the app into a stored-XSS sink — that is the whole
 * reason this component exists instead of a bare <Markdown> at each call site.
 *
 * `remark-gfm` is safe by contrast: it only adds tables, strikethrough,
 * task lists and autolinks to the Markdown grammar, all of which still produce
 * ordinary React elements.
 */
export function MarkdownPreview({ source }: { source: string }) {
  return (
    <div className="flex flex-col gap-2 text-sm [&_a]:underline [&_pre]:overflow-x-auto">
      <Markdown remarkPlugins={[remarkGfm]}>{source}</Markdown>
    </div>
  )
}
