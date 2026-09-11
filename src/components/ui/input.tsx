"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-10 w-full rounded-md border border-border bg-surface-2 px-3 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
