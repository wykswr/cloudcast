import { createContext, use } from 'react'

export type Toast = {
  id: number
  message: string
  tone?: 'default' | 'error'
  /** A link shown next to the message, e.g. "Watch". */
  action?: { label: string; to: string }
}

export type ToastContextValue = {
  notify: (toast: Omit<Toast, 'id'>) => void
}

export const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const ctx = use(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
