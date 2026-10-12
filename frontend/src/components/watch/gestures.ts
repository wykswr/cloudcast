/** Max gap between two taps to count as a double tap. */
export const DOUBLE_TAP_MS = 280
/** Horizontal travel before a touch turns into a seek gesture. */
export const SWIPE_THRESHOLD_PX = 12
/** Swiping across the full player width seeks this far (or the whole clip, if shorter). */
export const FULL_SWIPE_SECONDS = 120

/** A touch becomes a seek once it travels far enough, and more sideways than vertically. */
export function isSeekSwipe(dx: number, dy: number): boolean {
  return Math.abs(dx) >= SWIPE_THRESHOLD_PX && Math.abs(dx) >= Math.abs(dy)
}

/** Playback position for a swipe of `dx` pixels across a player `width` pixels wide. */
export function swipeSeekTarget(startTime: number, dx: number, width: number, duration: number) {
  const span = Math.min(duration, FULL_SWIPE_SECONDS)
  return Math.min(Math.max(startTime + (dx / (width || 1)) * span, 0), duration)
}
