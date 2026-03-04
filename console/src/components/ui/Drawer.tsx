"use client";

export function Drawer({
  open,
  onClose,
  title,
  children,
  side = "right",
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  side?: "left" | "right";
}) {
  if (!open) return null;
  const pos = side === "right" ? "right-0" : "left-0";
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="fixed inset-0 bg-black/30" onClick={onClose} aria-hidden />
      <div
        className={`fixed top-0 ${pos} z-10 h-full w-full max-w-md bg-white shadow-xl`}
        role="dialog"
        aria-modal="true"
      >
        {title && (
          <div className="border-b border-slate-200 px-4 py-3 text-lg font-medium text-slate-900">
            {title}
          </div>
        )}
        <div className="overflow-auto p-4">{children}</div>
      </div>
    </div>
  );
}
