import { useLibrary } from '../../context/library-context'
import { formatBytes } from '../../utils/format'

/** Storage used out of the account quota, from the library summary. */
function StorageMeter({ className = '' }: { className?: string }) {
  const { summary } = useLibrary()
  const used = summary?.storageUsedBytes ?? 0
  const quota = summary?.storageQuotaBytes ?? 0
  const pct = quota ? Math.min(100, Math.round((used / quota) * 100)) : 0
  const nearlyFull = pct >= 90
  return (
    <div
      className={`flex flex-col gap-2.5 rounded-xl border border-line bg-white p-3.5 ${className}`}
    >
      <div className="flex justify-between gap-2 text-[13px]">
        <span className="text-ink-2">Storage</span>
        <span className="font-semibold">
          {summary ? `${formatBytes(used)} of ${formatBytes(quota)}` : '—'}
        </span>
      </div>
      <div
        role="meter"
        aria-label="Storage used"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="h-1.5 overflow-hidden rounded-full bg-[#ecece8]"
      >
        <div
          className={`h-full rounded-full ${nearlyFull ? 'bg-warn-bar' : 'bg-accent'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {nearlyFull ? (
        <span className="text-xs text-warn">Almost full. Delete old videos to keep uploading.</span>
      ) : null}
    </div>
  )
}

export default StorageMeter
