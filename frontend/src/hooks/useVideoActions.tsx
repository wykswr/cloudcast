import { useState } from 'react'
import ConfirmDialog from '../components/common/ConfirmDialog'
import RenameDialog from '../components/common/RenameDialog'
import { useLibrary } from '../context/library-context'
import { useToast } from '../context/toast-context'
import { displayTitle } from '../utils/status'
import type { VideoItem } from '../types'

export type VideoActions = {
  toggleFavorite: (video: VideoItem) => void
  startRename: (video: VideoItem) => void
  askDelete: (video: VideoItem) => void
  copyLink: (video: VideoItem) => void
}

/** Favorite, rename, copy-link and delete for any list or page, plus the dialogs they open. */
export function useVideoActions(onDeleted?: (video: VideoItem) => void) {
  const library = useLibrary()
  const { notify } = useToast()
  const [renaming, setRenaming] = useState<VideoItem | null>(null)
  const [deleting, setDeleting] = useState<VideoItem | null>(null)

  const actions: VideoActions = {
    toggleFavorite: (video) => void library.toggleFavorite(video),
    startRename: setRenaming,
    askDelete: setDeleting,
    copyLink: (video) => {
      const url = `${window.location.origin}/watch/${video.id}`
      navigator.clipboard.writeText(url).then(
        () => notify({ message: 'Link copied' }),
        () => notify({ message: 'Couldn’t copy the link', tone: 'error' }),
      )
    },
  }

  const dialogs = (
    <>
      <RenameDialog
        key={renaming?.id ?? 'closed'}
        open={renaming !== null}
        currentTitle={renaming?.title ?? ''}
        onSave={async (title) => {
          if (!renaming) return
          await library.renameVideo(renaming, title)
          setRenaming(null)
          notify({ message: 'Title updated' })
        }}
        onCancel={() => setRenaming(null)}
      />
      <ConfirmDialog
        open={deleting !== null}
        title={deleting ? `Delete “${displayTitle(deleting)}”?` : ''}
        message="The video will be permanently removed. This can’t be undone."
        confirmLabel="Delete video"
        onConfirm={async () => {
          if (!deleting) return
          await library.deleteVideo(deleting)
          const removed = deleting
          setDeleting(null)
          notify({ message: 'Video deleted' })
          onDeleted?.(removed)
        }}
        onCancel={() => setDeleting(null)}
      />
    </>
  )

  return { actions, dialogs }
}
