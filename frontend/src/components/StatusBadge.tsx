import type { VideoItem } from '../types'

type StatusBadgeProps = {
  status: VideoItem['status']
}

function StatusBadge({ status }: StatusBadgeProps) {
  const tone =
    status === 'ready'
      ? 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-500/40'
      : status === 'processing'
        ? 'bg-blue-500/15 text-blue-100 ring-1 ring-blue-500/40'
        : status === 'uploading'
          ? 'bg-amber-500/20 text-amber-100 ring-1 ring-amber-500/40'
          : 'bg-rose-500/20 text-rose-100 ring-1 ring-rose-500/40'

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${tone}`}>
      {status}
    </span>
  )
}

export default StatusBadge
