"use client";

import { type InputHTMLAttributes, forwardRef } from "react";

export const Checkbox = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, "type">>(
  ({ className = "", ...props }, ref) => (
    <input
      ref={ref}
      type="checkbox"
      className={`h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 ${className}`}
      {...props}
    />
  )
);
Checkbox.displayName = "Checkbox";
