import { useEffect, useId, useRef, type ReactNode } from 'react'

type ModalProps = {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  /** alertdialog for destructive confirmations. */
  role?: 'dialog' | 'alertdialog'
  icon?: ReactNode
  className?: string
}

/** Centered dialog over a dimmed page. Escape or a click outside closes it. */
function Modal({
  open,
  onClose,
  title,
  children,
  role = 'dialog',
  icon,
  className = '',
}: ModalProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    // Focus the first field or button unless something inside already asked for it.
    const panel = panelRef.current
    if (panel && !panel.contains(document.activeElement)) {
      panel.querySelector<HTMLElement>('input, button:not([data-close])')?.focus()
    }
    return () => {
      window.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[rgba(14,16,20,0.45)] p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        className={`cc-rise flex w-full max-w-[420px] flex-col gap-4 rounded-2xl bg-white p-6 text-ink shadow-[0_30px_80px_rgba(0,0,0,0.3)] ${className}`}
      >
        {icon}
        <h2 id={titleId} className="m-0 text-lg font-semibold">
          {title}
        </h2>
        {children}
      </div>
    </div>
  )
}

export default Modal
