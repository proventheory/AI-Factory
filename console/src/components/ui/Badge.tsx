"use client";

type StatusVariant = "success" | "warning" | "error" | "neutral" | "info";

const variantClasses: Record<StatusVariant, string> = {
  success: "bg-emerald-100 text-emerald-800",
  warning: "bg-amber-100 text-amber-800",
  error: "bg-red-100 text-red-800",
  neutral: "bg-slate-100 text-slate-700",
  info: "bg-brand-100 text-brand-800",
};

export interface BadgeProps {
  children: React.ReactNode;
  variant?: StatusVariant;
  className?: string;
}

export function Badge({ children, variant = "neutral", className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${variantClasses[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
