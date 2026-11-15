import { STATUS_LABELS } from '../../utils/status'
import type { VideoStatus } from '../../types'

const TONES: Record<VideoStatus, string> = {
  ready: 'bg-good-soft text-good',
  uploading: 'bg-accent-soft text-accent',
  processing: 'bg-warn-soft text-warn',
  failed: 'bg-bad-soft text-bad',
}

function StatusBadge({ status }: { status: VideoStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONES[status]}`}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {STATUS_LABELS[status]}
    </span>
  )
}

export default StatusBadge
