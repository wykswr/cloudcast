import type { ReactNode } from 'react'

type EmptyStateProps = {
  icon: ReactNode
  title: string
  message: string
  action?: ReactNode
}

function EmptyState({ icon, title, message, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[#d3d3cc] bg-panel px-6 py-16 text-center">
      <span className="text-ink-3">{icon}</span>
      <h2 className="m-0 text-base font-semibold">{title}</h2>
      <p className="m-0 max-w-sm text-sm text-ink-2">{message}</p>
      {action}
    </div>
  )
}

export default EmptyState
