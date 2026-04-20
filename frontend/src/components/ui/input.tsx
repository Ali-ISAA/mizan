import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-foreground",
          "placeholder:text-text-muted",
          "transition-all duration-200",
          "hover:border-border-hover",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-600 focus-visible:border-accent-600",
          "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-surface/50",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
