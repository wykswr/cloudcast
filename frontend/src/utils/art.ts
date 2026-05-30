// Videos have no real thumbnails yet, so derive a stable cute gradient + emoji
// from the video id. Same id always renders the same art.

const GRADIENTS = [
  'linear-gradient(135deg,#ffd6e6,#d9c8ff)',
  'linear-gradient(135deg,#ffe0c2,#ffc2d6)',
  'linear-gradient(135deg,#c2f0e0,#bae6fd)',
  'linear-gradient(135deg,#e0d4ff,#c2e0ff)',
  'linear-gradient(135deg,#ffd6f0,#d4d0ff)',
  'linear-gradient(135deg,#d4f0c2,#baf0e6)',
]

const EMOJI = ['🌸', '🎬', '🎮', '🐱', '🌊', '🌃', '🤖', '⭐', '🎀', '🍰', '🌈', '🦋']

function hash(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i += 1) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0
  }
  return h
}

export function videoArt(id: string): { gradient: string; emoji: string } {
  const h = hash(id)
  return {
    gradient: GRADIENTS[h % GRADIENTS.length],
    emoji: EMOJI[(h >> 3) % EMOJI.length],
  }
}
