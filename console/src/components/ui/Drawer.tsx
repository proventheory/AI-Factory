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
    <div className="fixed inset-0 z-50 flex" style={{ paddingLeft: "env(safe-area-inset-left)", paddingRight: "env(safe-area-inset-right)" }}>
      <div className="fixed inset-0 bg-black/30" onClick={onClose} aria-hidden />
      <div
        className={`fixed top-0 bottom-0 ${pos} z-10 h-full w-full sm:max-w-md bg-white shadow-xl flex flex-col`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {title && (
          <div className="border-b border-slate-200 px-4 py-3 text-lg font-medium text-slate-900 shrink-0 safe-area-padding">
            {title}
          </div>
        )}
        <div className="flex-1 overflow-auto p-4 safe-area-padding">{children}</div>
      </div>
    </div>
  );
}
