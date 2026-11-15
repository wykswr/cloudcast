// Videos have no real thumbnails yet, so each one gets a stable two-tone "landscape" derived
// from its id: a sky, the ground, and a sun. Same id always renders the same art.

const PALETTES: [sky: string, ground: string, sun: string][] = [
  ['#e8b98a', '#8c5a45', '#fff1d6'],
  ['#dce3f0', '#b9c4da', '#2b4bee'],
  ['#c9d6df', '#7a6a5b', '#f6f1e7'],
  ['#efe6d8', '#b49b7c', '#ffffff'],
  ['#7fb3d0', '#1f5e7a', '#fff6da'],
  ['#2e2a2a', '#5a3b32', '#e59a5c'],
  ['#9db4c0', '#4f6d5a', '#f1e3c2'],
  ['#bfd3c1', '#5d7a62', '#faf3dd'],
  ['#3d4250', '#272a33', '#d8d2c4'],
  ['#f2e3e6', '#b88a94', '#ffffff'],
  ['#1b2a3a', '#0f1a24', '#9be3c1'],
  ['#f3d9b1', '#6b8f71', '#ffffff'],
]

function hash(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i += 1) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0
  }
  return h
}

export type VideoArt = {
  sky: string
  ground: string
  sun: string
  /** Sun position as percentages of the frame. */
  sunLeft: number
  sunTop: number
}

export function videoArt(id: string): VideoArt {
  const h = hash(id)
  const [sky, ground, sun] = PALETTES[h % PALETTES.length]
  return { sky, ground, sun, sunLeft: 14 + ((h >> 4) % 60), sunTop: 16 + ((h >> 9) % 22) }
}
