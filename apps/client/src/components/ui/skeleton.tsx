import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/cn.js'

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-none bg-[var(--muted)]', className)} {...props} />
}
