/* eslint-disable react-refresh/only-export-components */
import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full text-xs font-medium px-2.5 py-0.5 transition-colors',
  {
    variants: {
      variant: {
        default:  'bg-[var(--color-accent-soft)] text-[var(--color-accent)]',
        muted:    'bg-[var(--color-background)] text-[var(--color-muted)] border border-[var(--color-border)]',
        success:  'bg-[var(--color-success-soft)] text-[var(--color-success)]',
        numeric:  'bg-blue-50 text-blue-700',
        categorical: 'bg-amber-50 text-amber-700',
        datetime: 'bg-violet-50 text-violet-700',
      },
    },
    defaultVariants: { variant: 'default' },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
