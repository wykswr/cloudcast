import { useState } from 'react'
import Modal from './Modal'

type ConfirmDialogProps = {
  open: boolean
  emoji?: string
  title: string
  message: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void | Promise<void>
  onCancel: () => void
}

function ConfirmDialog({
  open,
  emoji = '🥺',
  title,
  message,
  confirmLabel = 'Delete 💔',
  cancelLabel = 'Keep it',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false)

  const handleConfirm = async () => {
    try {
      setBusy(true)
      await onConfirm()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onCancel} widthClass="max-w-sm">
      <div className="text-center text-5xl">{emoji}</div>
      <h2 className="mt-2 text-center text-xl">{title}</h2>
      <p className="mt-1 text-center text-sm text-sakura-ink-soft">{message}</p>
      <div className="mt-5 flex gap-2.5">
        <button
          className="sk-btn sk-btn-ghost flex-1 rounded-2xl py-3"
          onClick={onCancel}
          disabled={busy}
        >
          {cancelLabel}
        </button>
        <button
          className="sk-btn sk-btn-danger flex-1 rounded-2xl py-3"
          onClick={handleConfirm}
          disabled={busy}
        >
          {busy ? 'Working…' : confirmLabel}
        </button>
      </div>
    </Modal>
  )
}

export default ConfirmDialog
