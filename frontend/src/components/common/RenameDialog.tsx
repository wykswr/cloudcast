import { useState, type FormEvent } from 'react'
import Modal from './Modal'

type RenameDialogProps = {
  open: boolean
  currentTitle: string
  onSave: (title: string) => void | Promise<void>
  onCancel: () => void
}

/**
 * The field seeds from `currentTitle` on mount. Callers should pass a `key`
 * that changes when a new clip is targeted so the dialog remounts fresh —
 * avoids resetting state from inside an effect.
 */
function RenameDialog({ open, currentTitle, onSave, onCancel }: RenameDialogProps) {
  const [value, setValue] = useState(currentTitle)
  const [busy, setBusy] = useState(false)

  const trimmed = value.trim()
  const canSave = trimmed.length > 0 && trimmed !== currentTitle.trim()

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!canSave) {
      onCancel()
      return
    }
    try {
      setBusy(true)
      await onSave(trimmed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onCancel} widthClass="max-w-sm">
      <div className="text-center text-5xl">✏️</div>
      <h2 className="mt-2 text-center text-xl">Rename clip</h2>
      <p className="mt-1 text-center text-sm text-sakura-ink-soft">
        Give it a name that sparks joy ♡
      </p>
      <form onSubmit={handleSubmit} className="mt-4">
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="New title"
          className="sk-input"
        />
        <div className="mt-5 flex gap-2.5">
          <button
            type="button"
            className="sk-btn sk-btn-ghost flex-1 rounded-2xl py-3"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="sk-btn sk-btn-primary flex-1 rounded-2xl py-3"
            disabled={busy || !canSave}
          >
            {busy ? 'Saving…' : 'Save ✨'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default RenameDialog
