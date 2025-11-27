import type { StreamSelection } from '../types'
import HlsPlayer from './HlsPlayer'
import StatusBadge from './StatusBadge'

type PlaybackPanelProps = {
  activeStream: StreamSelection | null
}

function PlaybackPanel({ activeStream }: PlaybackPanelProps) {
  return (
    <div className="rounded-3xl border border-white/10 bg-slate-900/40 p-6 shadow-2xl shadow-sky-900/20">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-sky-200">
            Playback
          </p>
        </div>
        {activeStream && <StatusBadge status="ready" />}
      </div>
      {activeStream ? (
        <div className="mt-4">
          <HlsPlayer src={activeStream.url} title={activeStream.title} />
          <p className="mt-2 text-xs text-slate-400">
            Stream URL is short-lived per request.
          </p>
        </div>
      ) : (
        <div className="mt-6 rounded-2xl border border-dashed border-white/20 bg-slate-900/40 p-6 text-sm text-slate-300">
          Choose a video marked ready to stream a signed URL.
        </div>
      )}
    </div>
  )
}

export default PlaybackPanel
