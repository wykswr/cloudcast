import { useState, type ReactNode } from 'react'
import { formatError } from '../../utils/format'
import { TrashIcon } from './icons'
import Modal from './Modal'

type ConfirmDialogProps = {
  open: boolean
  title: ReactNode
  message: ReactNode
  confirmLabel?: string
  onConfirm: () => Promise<void> | void
  onCancel: () => void
}

/** "Are you sure?" for destructive actions; shows the error in place if the action fails. */
function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Delete',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cancel = () => {
    if (busy) return
    setError(null)
    onCancel()
  }

  const confirm = async () => {
    setBusy(true)
    setError(null)
    try {
      await onConfirm()
    } catch (err) {
      setError(formatError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={cancel}
      title={title}
      role="alertdialog"
      icon={
        <span className="grid size-11 place-items-center rounded-xl bg-bad-soft text-bad">
          <TrashIcon className="size-[22px]" />
        </span>
      }
    >
      <p className="m-0 text-sm leading-relaxed text-ink-2">{message}</p>
      {error ? (
        <p role="alert" className="m-0 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-secondary" onClick={cancel} disabled={busy}>
          Cancel
        </button>
        <button type="button" className="btn btn-danger" onClick={confirm} disabled={busy}>
          {busy ? 'Deleting…' : confirmLabel}
        </button>
      </div>
    </Modal>
  )
}

export default ConfirmDialog
