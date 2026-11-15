import { useState, type FormEvent } from 'react'
import { formatError } from '../../utils/format'
import Modal from './Modal'

const MAX_TITLE = 120

type RenameDialogProps = {
  open: boolean
  currentTitle: string
  onSave: (title: string) => Promise<void>
  onCancel: () => void
}

/**
 * The field seeds from `currentTitle` on mount. Callers should pass a `key`
 * that changes when a new video is targeted so the dialog remounts fresh.
 */
function RenameDialog({ open, currentTitle, onSave, onCancel }: RenameDialogProps) {
  const [value, setValue] = useState(currentTitle)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const trimmed = value.trim()
  const canSave = trimmed.length > 0 && trimmed !== currentTitle.trim()

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSave) {
      onCancel()
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onSave(trimmed)
    } catch (err) {
      setError(formatError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onCancel} title="Rename video">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="label">Title</span>
          <input
            autoFocus
            onFocus={(event) => event.target.select()}
            value={value}
            maxLength={MAX_TITLE}
            onChange={(event) => setValue(event.target.value)}
            className="field"
          />
          <span className="text-right text-xs text-ink-3">
            {value.length} / {MAX_TITLE}
          </span>
        </label>
        {error ? (
          <p role="alert" className="m-0 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || !canSave}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default RenameDialog
