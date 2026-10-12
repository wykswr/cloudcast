import { formatClock } from '../../utils/format'
import { FullscreenIcon, PauseIcon, PlayIcon } from './icons'
import { useTouchControls, type TouchControlsOptions } from './useTouchControls'

/**
 * Touch-first overlay for the player: single tap shows/hides the controls,
 * double tap toggles playback, horizontal swipe scrubs.
 */
function TouchControls(props: TouchControlsOptions) {
  const {
    playing,
    duration,
    shownTime,
    showControls,
    fullscreen,
    seekPreview,
    flash,
    surfaceHandlers,
    togglePlay,
    seekTo,
    toggleFullscreen,
    bumpActivity,
  } = useTouchControls(props)

  return (
    <>
      {/* Gesture surface. pan-y keeps vertical page scrolling (none in fullscreen, where there is
          no page to scroll) and both disable double-tap zoom. */}
      <div
        className={`absolute inset-0 z-10 select-none [-webkit-touch-callout:none] ${
          fullscreen ? 'touch-none' : 'touch-pan-y'
        }`}
        {...surfaceHandlers}
        onContextMenu={(event) => event.preventDefault()}
        aria-hidden
      />

      {seekPreview ? (
        <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center pb-14">
          <div className="rounded-2xl bg-black/65 px-5 py-3 text-center text-white backdrop-blur">
            <div className="font-display text-2xl font-bold">
              {seekPreview.delta >= 0 ? '+' : '−'}
              {formatClock(Math.abs(seekPreview.delta))}
            </div>
            <div className="text-xs tabular-nums text-white/75">
              {formatClock(seekPreview.target)} / {formatClock(duration)}
            </div>
          </div>
        </div>
      ) : null}

      {flash ? (
        <div
          key={flash.key}
          className="pointer-events-none absolute inset-0 z-20 grid place-items-center"
        >
          <div className="grid h-16 w-16 animate-[ping_0.6s_ease-out_1] place-items-center rounded-full bg-black/55 text-white">
            {flash.playing ? <PlayIcon className="h-8 w-8" /> : <PauseIcon className="h-8 w-8" />}
          </div>
        </div>
      ) : null}

      <div
        className={`absolute inset-x-0 bottom-0 z-30 rounded-b-[inherit] bg-linear-to-t from-black/75 to-transparent px-3 pb-2 pt-8 text-white transition-opacity duration-200 ${
          showControls ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={shownTime}
          disabled={!duration}
          onChange={(event) => {
            seekTo(Number(event.target.value))
            bumpActivity()
          }}
          className="block h-6 w-full cursor-pointer accent-sakura-pink"
          aria-label="Seek"
        />
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="grid h-9 w-9 place-items-center rounded-full"
            onClick={() => {
              togglePlay()
              bumpActivity()
            }}
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? <PauseIcon className="h-6 w-6" /> : <PlayIcon className="h-6 w-6" />}
          </button>
          <span className="text-xs tabular-nums text-white/85">
            {formatClock(shownTime)} / {formatClock(duration)}
          </span>
          <button
            type="button"
            className="ml-auto grid h-9 w-9 place-items-center rounded-full"
            onClick={() => void toggleFullscreen()}
            aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            <FullscreenIcon exit={fullscreen} />
          </button>
        </div>
      </div>
    </>
  )
}

export default TouchControls
