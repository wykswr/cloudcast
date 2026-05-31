import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import VideoCard from './VideoCard'
import type { VideoItem } from '../../types'

const navigateMock = vi.fn()
const toggleFavoriteMock = vi.fn()

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => navigateMock }
})

vi.mock('../../context/videos-context', () => ({
  useVideos: () => ({ toggleFavorite: toggleFavoriteMock }),
}))

const makeVideo = (overrides: Partial<VideoItem> = {}): VideoItem => ({
  id: 'v1',
  title: 'My Clip',
  status: 'ready',
  createdAt: 1_700_000_000,
  sizeBytes: 1024,
  durationSeconds: 65,
  favorite: false,
  ...overrides,
})

const renderCard = (video: VideoItem) => {
  const onRename = vi.fn()
  const onDelete = vi.fn()
  render(
    <MemoryRouter>
      <VideoCard video={video} onRename={onRename} onDelete={onDelete} />
    </MemoryRouter>,
  )
  return { onRename, onDelete }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('VideoCard', () => {
  it('renders the title and status badge', () => {
    renderCard(makeVideo())
    expect(screen.getByText('My Clip')).toBeInTheDocument()
    expect(screen.getByText('ready')).toBeInTheDocument()
  })

  it('shows a fallback title when none is set', () => {
    renderCard(makeVideo({ title: null }))
    expect(screen.getByText('Untitled clip')).toBeInTheDocument()
  })

  it('fires the rename and delete callbacks', async () => {
    const user = userEvent.setup()
    const { onRename, onDelete } = renderCard(makeVideo())

    await user.click(screen.getByTitle('Rename'))
    expect(onRename).toHaveBeenCalledWith(expect.objectContaining({ id: 'v1' }))

    await user.click(screen.getByTitle('Delete'))
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 'v1' }))
  })

  it('toggles favorite without triggering navigation', async () => {
    const user = userEvent.setup()
    renderCard(makeVideo())
    await user.click(screen.getByTitle('Favorite'))
    expect(toggleFavoriteMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'v1' }),
    )
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('navigates to the watch page when a ready video is opened', async () => {
    const user = userEvent.setup()
    renderCard(makeVideo({ status: 'ready' }))
    await user.click(document.querySelector('.aspect-video') as Element)
    expect(navigateMock).toHaveBeenCalledWith('/watch/v1')
  })

  it('does not navigate when the video is not ready', async () => {
    const user = userEvent.setup()
    renderCard(makeVideo({ status: 'processing' }))
    await user.click(document.querySelector('.aspect-video') as Element)
    expect(navigateMock).not.toHaveBeenCalled()
  })
})
