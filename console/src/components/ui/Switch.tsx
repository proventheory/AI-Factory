"use client";

import { type InputHTMLAttributes, forwardRef } from "react";

export const Switch = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, "type">>(
  ({ className = "", ...props }, ref) => (
    <label className={`relative inline-flex cursor-pointer items-center ${className}`}>
      <input ref={ref} type="checkbox" className="peer sr-only" {...props} />
      <div className="peer h-6 w-11 rounded-full bg-slate-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-slate-300 after:bg-white after:transition-all peer-checked:bg-brand-600 peer-checked:after:translate-x-5 peer-focus:ring-2 peer-focus:ring-brand-500" />
    </label>
  )
);
Switch.displayName = "Switch";
