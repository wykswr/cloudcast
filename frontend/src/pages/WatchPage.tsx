import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Topbar from '../components/layout/Topbar'
import VideoPlayer from '../components/watch/VideoPlayer'
import UpNextList from '../components/watch/UpNextList'
import StatusBadge from '../components/common/StatusBadge'
import Mascot from '../components/common/Mascot'
import ConfirmDialog from '../components/common/ConfirmDialog'
import RenameDialog from '../components/common/RenameDialog'
import { useShell } from '../components/layout/shell'
import { useVideos } from '../context/videos-context'
import { formatBytes, formatError, formatRelative } from '../utils/format'

const UP_NEXT_LIMIT = 8

/** Stands in for the player while the clip is unavailable or its stream URL is loading. */
function PlayerPlaceholder({ children }: { children: ReactNode }) {
  return (
    <div className="grid aspect-video place-items-center rounded-[22px] bg-white text-center text-sakura-ink-soft shadow-sk-panel">
      {children}
    </div>
  )
}

function WatchPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { openUpload } = useShell()
  const { videos, loading, getStreamUrl, toggleFavorite, renameVideo, deleteVideo } = useVideos()

  const [streamUrl, setStreamUrl] = useState<string | null>(null)
  const [streamError, setStreamError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [renaming, setRenaming] = useState(false)

  const video = useMemo(() => videos.find((v) => v.id === id), [videos, id])
  const upNext = useMemo(
    () => videos.filter((v) => v.id !== id && v.status === 'ready').slice(0, UP_NEXT_LIMIT),
    [videos, id],
  )

  useEffect(() => {
    if (!id || video?.status !== 'ready') return
    let cancelled = false
    const load = async () => {
      setStreamUrl(null)
      setStreamError(null)
      try {
        const url = await getStreamUrl(id)
        if (!cancelled) setStreamUrl(url)
      } catch (err) {
        if (!cancelled) setStreamError(formatError(err))
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [id, video?.status, getStreamUrl])

  if (!video) {
    return (
      <>
        <Topbar title="Now watching" onUpload={openUpload} />
        <div className="px-7 py-16 text-center text-sakura-ink-soft">
          <Mascot className="text-6xl" />
          <p className="mt-3 text-sm">
            {loading ? 'Finding your clip… 👀' : "Hmm, this clip isn't here."}
          </p>
          <button className="sk-btn sk-btn-ghost mt-4" onClick={() => navigate('/')}>
            ← Back to library
          </button>
        </div>
      </>
    )
  }

  const handleDelete = async () => {
    await deleteVideo(video.id)
    navigate('/')
  }

  return (
    <>
      <Topbar title="Now watching" subtitle={video.title ?? undefined} onUpload={openUpload} />
      <div className="px-7 pb-16 pt-5">
        <button
          className="mb-4 rounded-full bg-white px-3.5 py-2 text-[13px] font-bold text-sakura-ink-soft shadow-sk-soft"
          onClick={() => navigate(-1)}
        >
          ← Back
        </button>

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div>
            {video.status !== 'ready' ? (
              <PlayerPlaceholder>
                <div>
                  <Mascot className="text-5xl" />
                  <p className="mt-2 text-sm">
                    {video.status === 'failed'
                      ? 'This clip failed to process 😢'
                      : 'Still cooking your video… 🍳'}
                  </p>
                </div>
              </PlayerPlaceholder>
            ) : streamError ? (
              <div className="grid aspect-video place-items-center rounded-[22px] bg-sakura-fail/10 text-center text-sakura-fail">
                {streamError}
              </div>
            ) : streamUrl ? (
              <VideoPlayer src={streamUrl} />
            ) : (
              <PlayerPlaceholder>
                <Mascot className="text-5xl" />
              </PlayerPlaceholder>
            )}

            <div className="mt-5">
              <h2 className="text-2xl">{video.title || 'Untitled clip'}</h2>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-[13px] text-sakura-ink-soft">
                <StatusBadge status={video.status} />
                {video.sizeBytes ? <span>{formatBytes(video.sizeBytes)}</span> : null}
                <span>uploaded {formatRelative(video.createdAt)}</span>
                <div className="ml-auto flex gap-2">
                  <button
                    className="sk-chip bg-white text-sakura-ink shadow-sk-soft"
                    onClick={() => void toggleFavorite(video)}
                  >
                    {video.favorite ? '♥ Favorited' : '♡ Favorite'}
                  </button>
                  <button
                    className="sk-chip bg-white text-sakura-ink shadow-sk-soft"
                    onClick={() => setRenaming(true)}
                  >
                    ✏️ Rename
                  </button>
                  <button
                    className="sk-chip bg-white text-sakura-fail shadow-sk-soft"
                    onClick={() => setConfirming(true)}
                  >
                    🗑️ Delete
                  </button>
                </div>
              </div>
            </div>
          </div>

          <UpNextList videos={upNext} />
        </div>
      </div>

      <RenameDialog
        key={renaming ? `open-${video.id}` : 'closed'}
        open={renaming}
        currentTitle={video.title ?? ''}
        onSave={async (title) => {
          await renameVideo(video, title)
          setRenaming(false)
        }}
        onCancel={() => setRenaming(false)}
      />

      <ConfirmDialog
        open={confirming}
        title="Delete this clip?"
        message={
          <>
            This removes the uploaded and processed files for{' '}
            <b>"{video.title || 'Untitled clip'}"</b>. It can't be undone.
          </>
        }
        onConfirm={handleDelete}
        onCancel={() => setConfirming(false)}
      />
    </>
  )
}

export default WatchPage
