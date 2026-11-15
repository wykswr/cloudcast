import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CloseIcon } from '../components/common/icons'
import { ToastContext, type Toast } from './toast-context'

const TOAST_MS = 4500

/** Short notices at the bottom of the screen; newest on top, each fading after a few seconds. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((toast) => toast.id !== id))
  }, [])

  const notify = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = nextId.current
      nextId.current += 1
      setToasts((list) => [...list.slice(-2), { ...toast, id }])
      window.setTimeout(() => dismiss(id), TOAST_MS)
    },
    [dismiss],
  )

  const value = useMemo(() => ({ notify }), [notify])

  return (
    <ToastContext value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.tone === 'error' ? 'alert' : 'status'}
            className="cc-rise pointer-events-auto flex max-w-full items-center gap-3 rounded-xl bg-ink py-2.5 pr-2 pl-4 text-sm text-white shadow-[0_16px_40px_rgba(20,22,26,0.3)]"
          >
            {toast.tone === 'error' ? (
              <span className="size-2 shrink-0 rounded-full bg-[#ff8a78]" aria-hidden />
            ) : null}
            <span className="min-w-0">{toast.message}</span>
            {toast.action ? (
              <Link
                to={toast.action.to}
                onClick={() => dismiss(toast.id)}
                className="font-semibold whitespace-nowrap text-accent-light hover:text-white"
              >
                {toast.action.label}
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss"
              className="grid size-7 shrink-0 place-items-center rounded-md text-white/80 hover:bg-white/10"
            >
              <CloseIcon className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext>
  )
}
