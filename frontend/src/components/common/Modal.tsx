import { useEffect, type ReactNode } from 'react'

type ModalProps = {
  open: boolean
  onClose: () => void
  children: ReactNode
  /** Max width class for the modal card. */
  widthClass?: string
}

function Modal({ open, onClose, children, widthClass = 'max-w-lg' }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-5"
      style={{ background: 'rgba(70,40,80,0.35)', backdropFilter: 'blur(3px)' }}
      onClick={onClose}
    >
      <div
        className={`relative w-full ${widthClass} rounded-[28px] bg-white p-7 shadow-[0_30px_70px_-20px_rgba(255,93,143,0.5)]`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

export default Modal
