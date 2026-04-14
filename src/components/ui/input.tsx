import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "flex h-10 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm transition-colors placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900 disabled:bg-neutral-50 disabled:text-neutral-400",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
