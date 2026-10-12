import { useMemo, useState } from 'react'
import Topbar from '../components/layout/Topbar'
import VideoGrid from '../components/library/VideoGrid'
import EmptyState from '../components/library/EmptyState'
import Mascot from '../components/common/Mascot'
import { useShell } from '../components/layout/shell'
import { useVideos } from '../context/videos-context'
import { formatBytes } from '../utils/format'
import { isInFlight } from '../utils/status'
import type { VideoItem } from '../types'

export type LibraryView = 'all' | 'favorites' | 'recent' | 'processing'

const RECENT_LIMIT = 12

type ViewMeta = {
  title: string
  emptyTitle: string
  emptyMessage: string
  filter: (videos: VideoItem[]) => VideoItem[]
}

const VIEWS: Record<LibraryView, ViewMeta> = {
  all: {
    title: 'All clips',
    emptyTitle: 'Your shelf is empty',
    emptyMessage: "Upload your first clip and it'll show up right here!",
    filter: (v) => v,
  },
  favorites: {
    title: 'Favorites',
    emptyTitle: 'No favorites yet',
    emptyMessage: 'Tap the ♡ on a clip to keep it close.',
    filter: (v) => v.filter((x) => x.favorite),
  },
  recent: {
    title: 'Recent',
    emptyTitle: 'Nothing here yet',
    emptyMessage: 'Your latest uploads will appear here.',
    filter: (v) => v.slice(0, RECENT_LIMIT),
  },
  processing: {
    title: 'Processing',
    emptyTitle: 'Nothing cooking right now',
    emptyMessage: "When you upload a clip, you'll see it transcoding here.",
    filter: (v) => v.filter(isInFlight),
  },
}

function LibraryPage({ view }: { view: LibraryView }) {
  const { openUpload } = useShell()
  const { videos, loading, error } = useVideos()
  const [search, setSearch] = useState('')
  const meta = VIEWS[view]

  const filtered = useMemo(() => {
    let list = meta.filter(videos)
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter((v) => (v.title ?? '').toLowerCase().includes(q))
    }
    return list
  }, [meta, videos, search])

  const totalSize = videos.reduce((sum, v) => sum + (v.sizeBytes ?? 0), 0)
  const subtitle =
    view === 'all'
      ? `${videos.length} ${videos.length === 1 ? 'video' : 'videos'} · ${formatBytes(totalSize)}`
      : `${filtered.length} ${filtered.length === 1 ? 'clip' : 'clips'}`

  return (
    <>
      <Topbar
        title={meta.title}
        subtitle={subtitle}
        search={search}
        onSearchChange={setSearch}
        onUpload={openUpload}
      />
      <div className="px-7 pb-16 pt-5">
        {loading && videos.length === 0 ? (
          <div className="py-16 text-center text-sakura-ink-soft">
            <Mascot className="text-6xl" />
            <p className="mt-3 text-sm">Peeking at your clips… 👀</p>
          </div>
        ) : error && videos.length === 0 ? (
          <div className="rounded-2xl bg-sakura-fail/10 px-4 py-3 text-sm text-sakura-fail">
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title={search ? 'No matching clips' : meta.emptyTitle}
            message={search ? 'Try a different search ♡' : meta.emptyMessage}
            actionLabel={view === 'all' && !search ? 'Upload a clip' : undefined}
            onAction={view === 'all' && !search ? openUpload : undefined}
          />
        ) : (
          <VideoGrid videos={filtered} />
        )}
      </div>
    </>
  )
}

export default LibraryPage
