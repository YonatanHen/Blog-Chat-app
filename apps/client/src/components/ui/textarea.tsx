import { forwardRef, type TextareaHTMLAttributes } from 'react'
import { cn } from '../../lib/cn.js'

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'min-h-32 w-full rounded-md border border-[var(--border)] bg-transparent p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]',
        className,
      )}
      {...props}
    />
  ),
)
Textarea.displayName = 'Textarea'
