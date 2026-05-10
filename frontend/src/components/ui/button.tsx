import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-all duration-150 cursor-pointer disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2',
  {
    variants: {
      variant: {
        default:  'bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] shadow-[var(--shadow-sm)] focus-visible:outline-[var(--color-accent)]',
        outline:  'border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-background)] focus-visible:outline-[var(--color-accent)]',
        ghost:    'text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-border-light)]',
        soft:     'bg-[var(--color-accent-soft)] text-[var(--color-accent)] hover:bg-[var(--color-accent-muted)]',
      },
      size: {
        sm:   'text-xs px-3 py-1.5 rounded-[var(--radius-sm)]',
        md:   'text-sm px-4 py-2 rounded-[var(--radius-md)]',
        lg:   'text-sm px-6 py-2.5 rounded-[var(--radius-md)]',
        full: 'text-sm px-6 py-3 rounded-[var(--radius-md)] w-full',
      },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
