"use client";

export function TableFrame({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`-mx-4 md:mx-0 ${className}`}>
      <div className="overflow-x-auto px-4 md:px-0">
        <div className="min-w-[900px]">{children}</div>
      </div>
    </div>
  );
}
