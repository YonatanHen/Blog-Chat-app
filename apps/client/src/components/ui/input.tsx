import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '../../lib/cn.js'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-10 w-full rounded-md border border-[var(--border)] bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]',
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = 'Input'
