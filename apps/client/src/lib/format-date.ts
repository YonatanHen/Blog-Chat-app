// Fixed en-GB so the feed's date column stays one width regardless of locale —
// the metadata is set in a monospace face and lines up between cards.
const formatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

export function formatDate(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : formatter.format(date)
}
