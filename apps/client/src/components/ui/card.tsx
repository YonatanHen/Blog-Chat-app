import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/cn.js'

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-lg border border-[var(--border)] p-4', className)} {...props} />
}
