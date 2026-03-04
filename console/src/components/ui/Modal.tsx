"use client";

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div
        className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-auto rounded-lg bg-white p-4 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? "modal-title" : undefined}
      >
        {title && (
          <h2 id="modal-title" className="mb-3 text-lg font-semibold text-slate-900">
            {title}
          </h2>
        )}
        {children}
      </div>
    </div>
  );
}
