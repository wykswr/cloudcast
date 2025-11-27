import type { VideoItem, StreamSelection } from '../types'
import { formatDate } from '../utils/format'
import StatusBadge from './StatusBadge'

type VideoLibraryProps = {
  videos: VideoItem[]
  loading: boolean
  activeStream: StreamSelection | null
  onRefresh: () => void | Promise<void>
  onSelect: (video: VideoItem) => void | Promise<void>
  onDelete: (video: VideoItem) => void | Promise<void>
}

function VideoLibrary({
  videos,
  loading,
  activeStream,
  onRefresh,
  onSelect,
  onDelete,
}: VideoLibraryProps) {
  return (
    <div className="rounded-3xl border border-white/10 bg-slate-900/40 p-6 shadow-2xl shadow-sky-900/20">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-sky-200">
            Library
          </p>
          <h2 className="text-xl font-semibold text-white">Your uploads</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-sky-400 hover:text-white"
          >
            Refresh
          </button>
          <span className="text-xs text-slate-400">
            {loading ? 'Updating…' : ''}
          </span>
        </div>
      </div>

      {videos.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/20 bg-slate-900/40 p-6 text-sm text-slate-300">
          No videos yet. Upload to see processing state and playback.
        </div>
      ) : (
        <div className="space-y-3">
          {videos.map((video) => (
            <div
              key={video.id}
              className={`flex flex-col gap-3 rounded-2xl border border-white/10 bg-slate-900/50 p-4 transition hover:border-sky-400/40 md:flex-row md:items-center md:justify-between ${activeStream?.videoId === video.id ? 'ring-2 ring-sky-500/60' : ''
                }`}
            >
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="text-lg font-semibold text-white">
                    {video.title || 'Untitled video'}
                  </h3>
                  <StatusBadge status={video.status} />
                </div>
                <p className="text-xs text-slate-400">
                  {formatDate(video.createdAt)} · ID: {video.id}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => onSelect(video)}
                  disabled={video.status !== 'ready'}
                  className="rounded-xl border border-white/10 px-3 py-2 text-sm font-semibold text-slate-100 transition hover:border-sky-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {video.status === 'ready' ? 'Stream' : 'Awaiting HLS'}
                </button>
                <button
                  onClick={() => onDelete(video)}
                  className="rounded-xl border border-rose-500/40 px-3 py-2 text-sm font-semibold text-rose-100 transition hover:border-rose-400 hover:text-white"
                >
                  Delete
                </button>
                <div className="text-xs text-slate-400">
                  {video.status === 'processing'
                    ? 'MediaConvert in progress'
                    : video.status === 'ready'
                      ? 'Signed per playback'
                      : video.status === 'failed'
                        ? 'Processing failed'
                        : 'Uploading to raw bucket'}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default VideoLibrary
