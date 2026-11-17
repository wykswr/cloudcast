import { useCallback, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react'
import { fetchVideo } from '../lib/api'
import {
  isSending,
  nextToUpload,
  queueReducer,
  summarizeQueue,
  type QueueItem,
} from '../lib/upload-queue'
import { UploadSession, isAbortError, isVideoFile, titleFromFileName } from '../lib/uploads'
import { formatError } from '../utils/format'
import { displayTitle } from '../utils/status'
import { useLibrary } from './library-context'
import { useToast } from './toast-context'
import { UploadsContext } from './uploads-context'

const PROCESSING_POLL_MS = 5000

/**
 * Runs uploads for the whole app, so they keep going while people browse. Files upload one at a
 * time (each in parallel parts); afterwards each video is checked until it is ready to watch.
 */
export function UploadsProvider({ children }: { children: ReactNode }) {
  const { announceAdded, reportVideo, deleteVideo } = useLibrary()
  const { notify } = useToast()
  const [items, dispatch] = useReducer(queueReducer, [])
  const files = useRef(new Map<string, File>())
  const sessions = useRef(new Map<string, UploadSession>())
  const controllers = useRef(new Map<string, AbortController>())

  const addFiles = useCallback((picked: Iterable<File>) => {
    const added: QueueItem[] = []
    for (const file of picked) {
      const key = crypto.randomUUID()
      const video = isVideoFile(file)
      if (video) files.current.set(key, file)
      added.push({
        key,
        name: file.name,
        size: file.size,
        title: titleFromFileName(file.name),
        stage: video ? 'draft' : 'skipped',
        percent: 0,
        sentBytes: 0,
        error: video ? undefined : 'This isn’t a video, so we skipped it.',
      })
    }
    if (added.length) dispatch({ type: 'add', items: added })
  }, [])

  const run = useCallback(
    async (item: QueueItem) => {
      const file = files.current.get(item.key)
      if (!file) return
      const controller = new AbortController()
      controllers.current.set(item.key, controller)
      dispatch({ type: 'stage', key: item.key, stage: 'uploading' })

      let session = sessions.current.get(item.key)
      if (!session) {
        let announced = false
        session = new UploadSession(file, item.title, (state) => {
          dispatch({
            type: 'progress',
            key: item.key,
            percent: state.percent,
            sentBytes: state.sentBytes ?? 0,
            videoId: state.videoId,
          })
          // The library can list the video as soon as it exists.
          if (state.videoId && !announced) {
            announced = true
            announceAdded()
          }
        })
        sessions.current.set(item.key, session)
      }

      try {
        await session.run(controller.signal)
        dispatch({ type: 'stage', key: item.key, stage: 'processing' })
        files.current.delete(item.key)
        sessions.current.delete(item.key)
        announceAdded()
      } catch (error) {
        // Pausing or cancelling already set the stage.
        if (!isAbortError(error)) {
          dispatch({ type: 'stage', key: item.key, stage: 'error', error: formatError(error) })
        }
      } finally {
        controllers.current.delete(item.key)
      }
    },
    [announceAdded],
  )

  // Start the next queued file whenever nothing is uploading.
  useEffect(() => {
    const next = nextToUpload(items)
    if (next && !controllers.current.has(next.key)) void run(next)
  }, [items, run])

  // Check on videos that are getting ready until they can be watched.
  const processing = items.filter((item) => item.stage === 'processing' && item.videoId)
  const processingKey = processing.map((item) => `${item.key}:${item.videoId}`).join(',')
  useEffect(() => {
    if (!processingKey) return
    const watching = processingKey.split(',').map((pair) => pair.split(':'))
    const timer = window.setInterval(async () => {
      for (const [key, videoId] of watching) {
        try {
          const video = await fetchVideo(videoId)
          if (video.status === 'ready') {
            dispatch({ type: 'stage', key, stage: 'ready' })
            reportVideo(video)
            notify({
              message: `“${displayTitle(video)}” is ready to watch`,
              action: { label: 'Watch', to: `/watch/${video.id}` },
            })
          } else if (video.status === 'failed') {
            dispatch({
              type: 'stage',
              key,
              stage: 'failed',
              error: 'We couldn’t get this video ready.',
            })
            reportVideo(video)
            notify({ message: `“${displayTitle(video)}” couldn’t be prepared`, tone: 'error' })
          } else if (video.status === 'processing' && video.processingPercent != null) {
            dispatch({ type: 'processing', key, percent: video.processingPercent })
          }
        } catch {
          // Try again on the next tick.
        }
      }
    }, PROCESSING_POLL_MS)
    return () => window.clearInterval(timer)
  }, [processingKey, reportVideo, notify])

  // Leaving the page stops uploads, so ask first.
  const sending = items.some((item) => isSending(item.stage))
  useEffect(() => {
    if (!sending) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [sending])

  const setTitle = useCallback((key: string, title: string) => {
    dispatch({ type: 'title', key, title })
  }, [])

  const startAll = useCallback(() => dispatch({ type: 'start' }), [])

  const pause = useCallback((key: string) => {
    controllers.current.get(key)?.abort()
    dispatch({ type: 'stage', key, stage: 'paused' })
  }, [])

  const resume = useCallback((key: string) => {
    dispatch({ type: 'stage', key, stage: 'queued' })
  }, [])

  const remove = useCallback(
    (key: string) => {
      const item = items.find((entry) => entry.key === key)
      controllers.current.get(key)?.abort()
      dispatch({ type: 'remove', key })
      files.current.delete(key)
      const videoId = sessions.current.get(key)?.videoId
      sessions.current.delete(key)
      // An unfinished upload leaves a half-made video behind; remove it and free its storage.
      if (videoId && item && isSending(item.stage)) {
        deleteVideo({ id: videoId }).catch(() => {})
      }
    },
    [items, deleteVideo],
  )

  const clearFinished = useCallback(() => dispatch({ type: 'clear-finished' }), [])

  const progressFor = useCallback(
    (videoId: string) => {
      const item = items.find((entry) => entry.videoId === videoId && isSending(entry.stage))
      return item?.percent
    },
    [items],
  )

  const summary = useMemo(() => summarizeQueue(items), [items])

  const value = useMemo(
    () => ({
      items,
      summary,
      addFiles,
      setTitle,
      startAll,
      pause,
      resume,
      remove,
      clearFinished,
      progressFor,
    }),
    [
      items,
      summary,
      addFiles,
      setTitle,
      startAll,
      pause,
      resume,
      remove,
      clearFinished,
      progressFor,
    ],
  )

  return <UploadsContext value={value}>{children}</UploadsContext>
}
