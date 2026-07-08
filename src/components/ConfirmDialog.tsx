interface Props {
  title: string
  message: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({ title, message, confirmLabel = 'Delete', onConfirm, onCancel }: Props) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-6" onClick={onCancel}>
      <div
        className="w-full max-w-sm rounded-xl border-2 border-slate-800 bg-white shadow-[4px_4px_0_0_rgba(15,23,42,0.15)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b-2 border-slate-800 px-5 py-3">
          <h2 className="font-semibold">{title}</h2>
        </div>
        <div className="p-5">
          <p className="text-sm text-slate-600">{message}</p>
          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={onCancel}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
