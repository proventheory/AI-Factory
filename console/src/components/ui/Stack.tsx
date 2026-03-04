"use client";

export function Stack({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`flex flex-col gap-6 ${className}`}>{children}</div>;
}
