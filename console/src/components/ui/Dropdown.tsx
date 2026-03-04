"use client";

import { useRef, useEffect, useState } from "react";

export interface DropdownItem {
  label: string;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
}

export interface DropdownProps {
  trigger: React.ReactNode;
  items: DropdownItem[];
  align?: "left" | "right";
  className?: string;
}

export function Dropdown({ trigger, items, align = "right", className = "" }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  return (
    <div ref={ref} className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center rounded-md text-sm font-medium text-text-secondary hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
        aria-expanded={open}
        aria-haspopup="true"
      >
        {trigger}
      </button>
      {open && (
        <div
          className={`absolute z-50 mt-1 min-w-[10rem] rounded-md border border-border-subtle bg-white py-1 shadow-lg ${
            align === "right" ? "right-0" : "left-0"
          }`}
          role="menu"
        >
          {items.map((item, i) => {
            if (item.href) {
              return (
                <a
                  key={i}
                  href={item.href}
                  className={`block px-3 py-2 text-sm ${item.danger ? "text-state-danger hover:bg-state-dangerMuted" : "text-text-primary hover:bg-surface-sunken"} ${item.disabled ? "pointer-events-none opacity-50" : ""}`}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                </a>
              );
            }
            return (
              <button
                key={i}
                type="button"
                disabled={item.disabled}
                onClick={() => {
                  item.onClick?.();
                  setOpen(false);
                }}
                className={`block w-full px-3 py-2 text-left text-sm ${item.danger ? "text-state-danger hover:bg-state-dangerMuted" : "text-text-primary hover:bg-surface-sunken"} ${item.disabled ? "opacity-50" : ""}`}
                role="menuitem"
              >
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
