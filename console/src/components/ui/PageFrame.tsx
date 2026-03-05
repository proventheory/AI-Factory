"use client";

export function PageFrame({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`mx-auto w-full max-w-[1400px] px-4 py-4 sm:px-6 sm:py-6 ${className}`}
    >
      {children}
    </div>
  );
}
