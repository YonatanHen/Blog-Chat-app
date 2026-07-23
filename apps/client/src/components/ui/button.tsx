import { cva, type VariantProps } from 'class-variance-authority'
import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/cn.js'

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90',
        outline: 'border border-[var(--border)] bg-transparent hover:bg-[var(--muted)]',
        ghost: 'bg-transparent hover:bg-[var(--muted)]',
        destructive: 'bg-[var(--destructive)] text-[var(--primary-foreground)] hover:opacity-90',
      },
      size: {
        sm: 'h-8 px-3',
        default: 'h-10 px-4',
        lg: 'h-12 px-6 text-base',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
)
Button.displayName = 'Button'
