import { useState } from 'react'
import VideoCard from './VideoCard'
import ConfirmDialog from '../common/ConfirmDialog'
import RenameDialog from '../common/RenameDialog'
import { useVideos } from '../../context/videos-context'
import { formatError } from '../../utils/format'
import type { VideoItem } from '../../types'

type VideoGridProps = {
  videos: VideoItem[]
}

/** Responsive card grid. Owns the rename + delete dialogs for its cards. */
function VideoGrid({ videos }: VideoGridProps) {
  const { renameVideo, deleteVideo } = useVideos()
  const [pending, setPending] = useState<VideoItem | null>(null)
  const [renaming, setRenaming] = useState<VideoItem | null>(null)
  const [error, setError] = useState<string | null>(null)

  const confirmDelete = async () => {
    if (!pending) return
    try {
      await deleteVideo(pending.id)
      setPending(null)
    } catch (err) {
      setError(formatError(err))
      setPending(null)
    }
  }

  const confirmRename = async (title: string) => {
    if (!renaming) return
    try {
      await renameVideo(renaming, title)
    } finally {
      setRenaming(null)
    }
  }

  return (
    <>
      {error && (
        <div className="mb-4 rounded-2xl bg-sakura-fail/10 px-4 py-3 text-sm text-sakura-fail">
          {error}
        </div>
      )}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-5">
        {videos.map((video) => (
          <VideoCard
            key={video.id}
            video={video}
            onRename={setRenaming}
            onDelete={setPending}
          />
        ))}
      </div>

      <RenameDialog
        key={renaming?.id ?? 'none'}
        open={renaming !== null}
        currentTitle={renaming?.title ?? ''}
        onSave={confirmRename}
        onCancel={() => setRenaming(null)}
      />

      <ConfirmDialog
        open={pending !== null}
        title="Delete this clip?"
        message={
          <>
            This removes the uploaded and processed files for{' '}
            <b>"{pending?.title || 'Untitled clip'}"</b>. It can't be undone.
          </>
        }
        onConfirm={confirmDelete}
        onCancel={() => setPending(null)}
      />
    </>
  )
}

export default VideoGrid
