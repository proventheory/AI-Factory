"use client";

import { type ButtonHTMLAttributes, type ReactElement, cloneElement, forwardRef, isValidElement } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** When true, render the single child element with button styles merged (e.g. <Button asChild><Link href="...">...</Link></Button>). */
  asChild?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 border-transparent",
  secondary: "bg-slate-100 text-slate-800 hover:bg-slate-200 border-slate-300",
  ghost: "bg-transparent text-slate-700 hover:bg-slate-100 border-transparent",
  danger: "bg-red-600 text-white hover:bg-red-700 border-transparent",
};

const sizeClasses: Record<Size, string> = {
  sm: "px-2.5 py-1.5 text-xs rounded",
  md: "px-3 py-2 text-sm rounded-md",
  lg: "px-4 py-2.5 text-base rounded-md",
};

const baseClass =
  "inline-flex items-center justify-center border font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none";

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "primary", size = "md", disabled, asChild, children, ...props }, ref) => {
    const combinedClassName = `${baseClass} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`.trim();
    if (asChild && isValidElement(children)) {
      const child = children as ReactElement<{ className?: string }>;
      const childClassName = [combinedClassName, child.props?.className].filter(Boolean).join(" ");
      return cloneElement(child, { ...child.props, className: childClassName });
    }
    return (
      <button
        ref={ref}
        className={combinedClassName}
        disabled={disabled}
        {...props}
      >
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
