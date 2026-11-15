import { useState, type DragEvent } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import type { VideoListFilter, VideoListOrder } from '@cloudcast/contracts'
import EmptyState from '../components/library/EmptyState'
import VideoCard, { VideoCardSkeleton } from '../components/library/VideoCard'
import VideoTable from '../components/library/VideoTable'
import {
  CloseIcon,
  GridIcon,
  HeartIcon,
  ListIcon,
  RefreshIcon,
  SearchIcon,
  UploadCloudIcon,
  UploadIcon,
} from '../components/common/icons'
import { useLibrary } from '../context/library-context'
import { useUploads } from '../context/uploads-context'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { usePersistentState } from '../hooks/usePersistentState'
import { useVideoActions } from '../hooks/useVideoActions'
import { useVideoPage } from '../hooks/useVideoPage'

export type LibraryView = 'all' | 'favorites' | 'recent' | 'in-progress'

const PAGE_SIZE = 24
const RECENT_SIZE = 12

type ViewMeta = {
  title: string
  filter: VideoListFilter
  emptyTitle: string
  emptyMessage: string
}

const VIEWS: Record<LibraryView, ViewMeta> = {
  all: {
    title: 'All videos',
    filter: 'all',
    emptyTitle: 'Upload your first video',
    emptyMessage:
      'Drop a video anywhere on this page, or choose one. We’ll get it ready to play on any device.',
  },
  favorites: {
    title: 'Favorites',
    filter: 'favorites',
    emptyTitle: 'No favorites yet',
    emptyMessage: 'Tap the heart on a video to keep it here.',
  },
  recent: {
    title: 'Recent',
    filter: 'all',
    emptyTitle: 'Nothing here yet',
    emptyMessage: 'Your latest uploads will show up here.',
  },
  'in-progress': {
    title: 'In progress',
    filter: 'in-progress',
    emptyTitle: 'Nothing in progress',
    emptyMessage: 'Videos that are still uploading or getting ready show up here.',
  },
}

const CHIPS: { to: string; label: string }[] = [
  { to: '/', label: 'All' },
  { to: '/favorites', label: 'Favorites' },
  { to: '/recent', label: 'Recent' },
  { to: '/in-progress', label: 'In progress' },
]

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

function LibraryPage({ view }: { view: LibraryView }) {
  const meta = VIEWS[view]
  const navigate = useNavigate()
  const { summary } = useLibrary()
  const { addFiles } = useUploads()
  const [query, setQuery] = useState('')
  const q = useDebouncedValue(query.trim(), 250)
  const [order, setOrder] = usePersistentState<VideoListOrder>('cc.library.order', 'newest')
  const [layout, setLayout] = usePersistentState<'grid' | 'list'>('cc.library.layout', 'grid')
  const [dragging, setDragging] = useState(false)
  const recent = view === 'recent'

  const page = useVideoPage({
    filter: meta.filter,
    q,
    order: recent ? 'newest' : order,
    pageSize: recent ? RECENT_SIZE : PAGE_SIZE,
  })
  const { actions, dialogs } = useVideoActions()

  const total =
    view === 'all'
      ? summary?.total
      : view === 'favorites'
        ? summary?.favorites
        : view === 'in-progress'
          ? summary?.inProgress
          : undefined
  const subtitle = q
    ? page.loading
      ? 'Searching…'
      : `${plural(page.items.length, 'result')}${page.hasMore ? '+' : ''} for “${q}”`
    : total !== undefined
      ? plural(total, 'video')
      : null

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    if (event.dataTransfer.files.length) {
      addFiles(event.dataTransfer.files)
      navigate('/upload')
    }
  }

  const showEmpty = !page.initialLoading && !page.loading && !page.error && page.items.length === 0
  const showMoreFooter = !recent && page.hasMore
  const showEnd = !recent && !q && !page.hasMore && !page.loading && page.items.length > PAGE_SIZE

  return (
    <div
      className="relative flex min-h-full flex-col gap-6 px-4 pt-3 pb-16 md:px-8 md:pt-5"
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setDragging(false)
      }}
      onDrop={onDrop}
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-[520px] min-w-[170px] flex-1">
          <SearchIcon className="pointer-events-none absolute top-[13px] left-3.5 size-[18px] text-ink-3" />
          <label htmlFor="library-search" className="sr-only">
            Search videos
          </label>
          <input
            id="library-search"
            role="searchbox"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setQuery('')
            }}
            placeholder="Search by title"
            autoComplete="off"
            className="field h-11 pr-11 pl-[42px] text-sm"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="icon-btn absolute top-1 right-1"
            >
              <CloseIcon className="size-4" />
            </button>
          ) : null}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {!recent ? (
            <>
              <label htmlFor="library-sort" className="hidden text-[13px] text-ink-2 sm:inline">
                Sort
              </label>
              <select
                id="library-sort"
                value={order}
                onChange={(event) => setOrder(event.target.value as VideoListOrder)}
                className="h-10 rounded-[10px] border border-line-strong bg-white px-2.5 text-sm text-ink"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
            </>
          ) : null}
          <div
            role="group"
            aria-label="Layout"
            className="hidden gap-0.5 rounded-[10px] bg-fill p-[3px] sm:flex"
          >
            {(
              [
                ['grid', 'Grid view', GridIcon],
                ['list', 'List view', ListIcon],
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                aria-label={label}
                aria-pressed={layout === value}
                onClick={() => setLayout(value)}
                className={`grid h-[34px] w-9 place-items-center rounded-lg ${
                  layout === value
                    ? 'bg-white text-ink shadow-[0_1px_3px_rgba(20,22,26,0.12)]'
                    : 'text-ink-2'
                }`}
              >
                <Icon />
              </button>
            ))}
          </div>
        </div>
      </div>

      <nav
        aria-label="Filter"
        className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] md:hidden"
      >
        {CHIPS.map((chip) => (
          <NavLink
            key={chip.to}
            to={chip.to}
            end
            className={({ isActive }) =>
              `flex h-9 shrink-0 items-center rounded-full border px-3.5 text-sm font-semibold no-underline ${
                isActive ? 'border-ink bg-ink text-white' : 'border-line-strong bg-white text-ink'
              }`
            }
          >
            {chip.label}
          </NavLink>
        ))}
      </nav>

      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="m-0 font-display text-[26px] font-semibold tracking-[-0.02em] md:text-[28px]">
          {meta.title}
        </h1>
        {subtitle ? <span className="text-sm text-ink-3">{subtitle}</span> : null}
      </div>

      {page.error ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#f1cfc7] bg-bad-soft px-4 py-3 text-sm text-[#8f2614]"
        >
          <span>We couldn’t load your videos. {page.error}</span>
          <button type="button" className="btn btn-secondary h-9" onClick={page.reload}>
            Try again
          </button>
        </div>
      ) : null}

      {page.initialLoading ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-x-5 gap-y-7">
          {Array.from({ length: 8 }, (_, i) => (
            <VideoCardSkeleton key={i} />
          ))}
        </div>
      ) : null}

      {showEmpty ? (
        q ? (
          <EmptyState
            icon={<SearchIcon className="size-10" strokeWidth={1.5} />}
            title={`No videos match “${q}”`}
            message="Check the spelling or try another word."
            action={
              <button type="button" className="btn btn-secondary mt-1" onClick={() => setQuery('')}>
                Clear search
              </button>
            }
          />
        ) : (
          <EmptyState
            icon={
              view === 'favorites' ? (
                <HeartIcon className="size-10" strokeWidth={1.5} />
              ) : view === 'in-progress' ? (
                <RefreshIcon className="size-10" strokeWidth={1.5} />
              ) : (
                <UploadCloudIcon className="size-10" strokeWidth={1.5} />
              )
            }
            title={meta.emptyTitle}
            message={meta.emptyMessage}
            action={
              view === 'all' ? (
                <button
                  type="button"
                  className="btn btn-primary mt-1"
                  onClick={() => navigate('/upload')}
                >
                  <UploadIcon />
                  Choose a video
                </button>
              ) : undefined
            }
          />
        )
      ) : null}

      {page.items.length > 0 ? (
        <div
          className={`transition-opacity ${page.loading ? 'opacity-60' : ''}`}
          aria-busy={page.loading}
        >
          {layout === 'grid' ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-x-5 gap-y-7">
              {page.items.map((video) => (
                <VideoCard key={video.id} video={video} actions={actions} />
              ))}
              {page.loadingMore
                ? Array.from({ length: 4 }, (_, i) => <VideoCardSkeleton key={`more-${i}`} />)
                : null}
            </div>
          ) : (
            <VideoTable videos={page.items} actions={actions} />
          )}
        </div>
      ) : null}

      {showMoreFooter ? (
        <div className="flex flex-col items-center gap-2.5 pt-2">
          {!q && total ? (
            <>
              <span className="text-[13px] text-ink-2">
                Showing {Math.min(page.items.length, total)} of {plural(total, 'video')}
              </span>
              <div className="h-1 w-[200px] overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${Math.min(100, (page.items.length / total) * 100)}%` }}
                />
              </div>
            </>
          ) : null}
          {page.moreError ? (
            <span role="alert" className="text-[13px] text-bad">
              Couldn’t load more. {page.moreError}
            </span>
          ) : null}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void page.loadMore()}
            disabled={page.loadingMore}
          >
            {page.loadingMore ? 'Loading…' : page.moreError ? 'Try again' : 'Load more videos'}
          </button>
        </div>
      ) : null}

      {showEnd ? (
        <div className="flex items-center gap-3 pt-2 text-[13px] text-ink-3">
          <span className="h-px flex-1 bg-line" />
          That’s everything · {plural(page.items.length, 'video')}
          <span className="h-px flex-1 bg-line" />
        </div>
      ) : null}

      {dragging ? (
        <div className="pointer-events-none absolute inset-2 z-20 grid place-items-center rounded-2xl border-2 border-dashed border-accent bg-accent-soft/90">
          <div className="flex flex-col items-center gap-2 text-accent-ink">
            <UploadCloudIcon className="size-10" />
            <span className="text-lg font-semibold">Drop to upload</span>
          </div>
        </div>
      ) : null}

      {dialogs}
    </div>
  )
}

export default LibraryPage
