import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-600 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-r from-accent-600 to-accent-700 text-white shadow-md hover:shadow-lg hover:shadow-accent-600/30 hover:-translate-y-0.5 active:scale-[0.98]",
        destructive:
          "bg-critical text-critical-foreground shadow-md hover:bg-critical/90 hover:shadow-lg hover:shadow-critical/30 hover:-translate-y-0.5 active:scale-[0.98]",
        outline:
          "border-2 border-border bg-transparent hover:bg-surface hover:border-accent-600 hover:text-accent-600",
        secondary:
          "bg-surface text-foreground border border-border hover:bg-surface/80 hover:shadow-md",
        ghost:
          "hover:bg-surface/80 hover:text-accent-600",
        link:
          "text-accent-600 underline-offset-4 hover:underline hover:text-accent-700",
        success:
          "bg-success text-success-foreground shadow-md hover:shadow-lg hover:shadow-success/30 hover:-translate-y-0.5 active:scale-[0.98]",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3 text-xs",
        lg: "h-12 px-8 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
