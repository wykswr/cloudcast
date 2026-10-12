import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'
import { DOUBLE_TAP_MS, isSeekSwipe, swipeSeekTarget } from './gestures'

const CONTROLS_HIDE_MS = 3000
const FLASH_MS = 600

type Gesture = {
  pointerId: number
  startX: number
  startY: number
  startTime: number
  seeking: boolean
}

export type SeekPreview = {
  target: number
  delta: number
}

export type TouchControlsOptions = {
  videoRef: RefObject<HTMLVideoElement | null>
  fullscreenRef: RefObject<HTMLElement | null>
  /** CSS fullscreen, used where the Fullscreen API can't take the player (iPhone Safari). */
  pseudoFullscreen: boolean
  onPseudoFullscreenChange: (active: boolean) => void
}

/** Mirrors the <video> element's play state, position and duration into React state. */
function usePlaybackState(videoRef: RefObject<HTMLVideoElement | null>) {
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const syncPlaying = () => setPlaying(!video.paused)
    const syncTime = () => setCurrentTime(video.currentTime)
    const syncDuration = () => setDuration(Number.isFinite(video.duration) ? video.duration : 0)
    const listeners: [string, () => void][] = [
      ['play', syncPlaying],
      ['pause', syncPlaying],
      ['timeupdate', syncTime],
      ['seeked', syncTime],
      ['durationchange', syncDuration],
      ['loadedmetadata', syncDuration],
    ]

    for (const [type, listener] of listeners) video.addEventListener(type, listener)
    return () => {
      for (const [type, listener] of listeners) video.removeEventListener(type, listener)
    }
  }, [videoRef])

  return { playing, currentTime, setCurrentTime, duration }
}

/**
 * State and handlers for the touch overlay: single tap shows/hides the controls,
 * double tap toggles playback, horizontal swipe scrubs.
 */
export function useTouchControls({
  videoRef,
  fullscreenRef,
  pseudoFullscreen,
  onPseudoFullscreenChange,
}: TouchControlsOptions) {
  const { playing, currentTime, setCurrentTime, duration } = usePlaybackState(videoRef)
  const [controlsVisible, setControlsVisible] = useState(true)
  const [seekPreview, setSeekPreview] = useState<SeekPreview | null>(null)
  const [flash, setFlash] = useState<{ playing: boolean; key: number } | null>(null)
  const [nativeFullscreen, setNativeFullscreen] = useState(false)
  // Bumped on every control interaction so the auto-hide countdown restarts.
  const [activity, setActivity] = useState(0)

  const gestureRef = useRef<Gesture | null>(null)
  const lastTapRef = useRef(0)
  const singleTapTimer = useRef<number | undefined>(undefined)
  const hideTimer = useRef<number | undefined>(undefined)
  const flashTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    const onChange = () => setNativeFullscreen(document.fullscreenElement === fullscreenRef.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [fullscreenRef])

  // Keep the controls up while paused or scrubbing; fade them out during playback.
  useEffect(() => {
    window.clearTimeout(hideTimer.current)
    if (!controlsVisible || !playing || seekPreview) return
    hideTimer.current = window.setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_MS)
    return () => window.clearTimeout(hideTimer.current)
  }, [controlsVisible, playing, seekPreview, activity])

  useEffect(
    () => () => {
      window.clearTimeout(singleTapTimer.current)
      window.clearTimeout(flashTimer.current)
    },
    [],
  )

  const bumpActivity = () => setActivity((n) => n + 1)

  const togglePlay = () => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      void video.play().catch(() => {})
    } else {
      video.pause()
    }
  }

  const togglePlayWithFlash = () => {
    const video = videoRef.current
    if (!video) return
    const willPlay = video.paused
    togglePlay()
    window.clearTimeout(flashTimer.current)
    setFlash({ playing: willPlay, key: Date.now() })
    flashTimer.current = window.setTimeout(() => setFlash(null), FLASH_MS)
  }

  const seekTo = (seconds: number) => {
    const video = videoRef.current
    if (!video || !duration) return
    video.currentTime = Math.min(Math.max(seconds, 0), duration)
    setCurrentTime(video.currentTime)
  }

  const toggleFullscreen = async () => {
    const container = fullscreenRef.current
    if (pseudoFullscreen) {
      onPseudoFullscreenChange(false)
      return
    }
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {})
      return
    }
    if (container && document.fullscreenEnabled) {
      try {
        await container.requestFullscreen()
        const orientation = screen.orientation as ScreenOrientation & {
          lock?: (o: string) => Promise<void>
        }
        await orientation.lock?.('landscape').catch(() => {})
      } catch {
        // Ignore: the browser refused fullscreen.
      }
      return
    }
    // iPhone Safari can only fullscreen the <video> element itself, which hands control to
    // the system player and drops our gestures, so cover the viewport with the player instead.
    onPseudoFullscreenChange(true)
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || gestureRef.current) return
    gestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startTime: videoRef.current?.currentTime ?? 0,
      seeking: false,
    }
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId || !duration) return

    const dx = event.clientX - gesture.startX
    const dy = event.clientY - gesture.startY
    if (!gesture.seeking) {
      if (!isSeekSwipe(dx, dy)) return
      gesture.seeking = true
      event.currentTarget.setPointerCapture(event.pointerId)
      window.clearTimeout(singleTapTimer.current)
      lastTapRef.current = 0
    }

    const target = swipeSeekTarget(gesture.startTime, dx, event.currentTarget.clientWidth, duration)
    setSeekPreview({ target, delta: target - gesture.startTime })
  }

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    gestureRef.current = null

    if (gesture.seeking) {
      if (seekPreview) seekTo(seekPreview.target)
      setSeekPreview(null)
      setControlsVisible(true)
      return
    }

    const now = performance.now()
    if (now - lastTapRef.current < DOUBLE_TAP_MS) {
      window.clearTimeout(singleTapTimer.current)
      lastTapRef.current = 0
      togglePlayWithFlash()
      return
    }

    lastTapRef.current = now
    singleTapTimer.current = window.setTimeout(() => {
      setControlsVisible((visible) => !visible)
    }, DOUBLE_TAP_MS)
  }

  const onPointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (gestureRef.current?.pointerId !== event.pointerId) return
    gestureRef.current = null
    setSeekPreview(null)
  }

  return {
    playing,
    duration,
    shownTime: seekPreview?.target ?? currentTime,
    showControls: controlsVisible || !playing || seekPreview !== null,
    fullscreen: nativeFullscreen || pseudoFullscreen,
    seekPreview,
    flash,
    surfaceHandlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel },
    togglePlay,
    seekTo,
    toggleFullscreen,
    bumpActivity,
  }
}
