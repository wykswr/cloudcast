import Mascot from '../common/Mascot'

type EmptyStateProps = {
  title: string
  message: string
  actionLabel?: string
  onAction?: () => void
}

function EmptyState({ title, message, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="py-16 text-center text-sakura-ink-soft">
      <Mascot className="text-7xl" />
      <h3 className="mb-1.5 mt-2.5 text-xl text-sakura-ink">{title}</h3>
      <p className="text-sm">{message}</p>
      {actionLabel && onAction && (
        <button className="sk-btn sk-btn-primary mt-4" onClick={onAction}>
          ＋ {actionLabel}
        </button>
      )}
    </div>
  )
}

export default EmptyState
