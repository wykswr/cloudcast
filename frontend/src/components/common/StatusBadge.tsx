import type { VideoItem } from '../../types'

type StatusBadgeProps = {
  status: VideoItem['status']
}

const STATUS_META: Record<string, { label: string; emoji: string; className: string }> = {
  ready: { label: 'ready', emoji: '✌️', className: 'bg-sakura-ready text-white' },
  processing: { label: 'cooking', emoji: '🍳', className: 'bg-sakura-proc text-white' },
  uploading: { label: 'uploading', emoji: '⬆️', className: 'bg-sakura-sky text-white' },
  failed: { label: 'oops', emoji: '😢', className: 'bg-sakura-fail text-white' },
}

function StatusBadge({ status }: StatusBadgeProps) {
  const meta = STATUS_META[status] ?? {
    label: status,
    emoji: '☁️',
    className: 'bg-sakura-ink-soft text-white',
  }
  return (
    <span className={`sk-chip ${meta.className}`}>
      <span aria-hidden>{meta.emoji}</span>
      {meta.label}
    </span>
  )
}

export default StatusBadge
