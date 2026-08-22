import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "@radix-ui/react-slot";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "bg-emerald-400 px-4 py-2.5 text-[#050507] shadow-[0_12px_24px_-14px_rgba(110,231,183,0.4)] hover:translate-y-[-1px] hover:bg-emerald-300 hover:shadow-[0_16px_32px_-14px_rgba(110,231,183,0.5)]",
        secondary:
          "bg-white/[0.04] px-4 py-2.5 text-white hover:bg-white/[0.08]",
        outline:
          "border border-white/[0.08] px-4 py-2.5 text-zinc-300 hover:bg-white/[0.04] hover:text-white",
        ghost:
          "px-3 py-2 text-zinc-500 hover:bg-white/[0.04] hover:text-white",
      },
      size: {
        sm: "h-9 rounded-lg px-3 text-xs",
        md: "h-10 px-4",
        lg: "h-12 rounded-xl px-5 text-base",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size }), className)}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
