export type Rung = { name: string; width: number; height: number; maxrateKbps: number }

/** Smallest first. Each rung is a 16:9 box the picture is scaled to fit inside. */
export const LADDER: Rung[] = [
  { name: '720p', width: 1280, height: 720, maxrateKbps: 2800 },
  { name: '1080p', width: 1920, height: 1080, maxrateKbps: 5000 },
  { name: '1440p', width: 2560, height: 1440, maxrateKbps: 9000 },
  { name: '2160p', width: 3840, height: 2160, maxrateKbps: 16000 },
]

export const SEGMENT_SECONDS = 4
export const MASTER_PLAYLIST = 'master.m3u8'

export type Source = {
  /** Absolute ffmpeg stream indexes within the input file. */
  videoIndex: number
  audioIndex: number | null
  /** Display dimensions, after any rotation metadata is applied. */
  width: number
  height: number
}

type ProbeStream = {
  index: number
  codec_type?: string
  width?: number
  height?: number
  disposition?: { attached_pic?: number }
  tags?: { rotate?: string }
  side_data_list?: { rotation?: number }[]
}

/** Reads `ffprobe -print_format json -show_streams` output. */
export function parseProbe(json: string): Source {
  const streams = (JSON.parse(json) as { streams?: ProbeStream[] }).streams ?? []
  // Cover art in MKV/MP4 files is exposed as a video stream; it is not the film.
  const video = streams.find(
    (stream) =>
      stream.codec_type === 'video' &&
      !stream.disposition?.attached_pic &&
      stream.width &&
      stream.height,
  )
  if (!video?.width || !video.height) throw new Error('Source has no video stream')
  const rotation = Number(
    video.side_data_list?.find((entry) => entry.rotation != null)?.rotation ??
      video.tags?.rotate ??
      0,
  )
  const sideways = Math.abs(rotation) % 180 === 90
  const audio = streams.find((stream) => stream.codec_type === 'audio')
  return {
    videoIndex: video.index,
    audioIndex: audio?.index ?? null,
    width: sideways ? video.height : video.width,
    height: sideways ? video.width : video.height,
  }
}

/**
 * Source duration in seconds from `ffprobe -show_format -show_streams` output: the container's
 * duration, else the longest stream's. Null when the file does not say.
 */
export function parseDuration(json: string): number | null {
  const probe = JSON.parse(json) as {
    format?: { duration?: string | number }
    streams?: { duration?: string | number }[]
  }
  const seconds = (value: string | number | undefined) => {
    const parsed = Number(value)
    return value != null && Number.isFinite(parsed) && parsed > 0 ? parsed : null
  }
  const container = seconds(probe.format?.duration)
  if (container) return container
  const streams = (probe.streams ?? []).map((stream) => seconds(stream.duration) ?? 0)
  const longest = Math.max(0, ...streams)
  return longest > 0 ? longest : null
}

/**
 * Whole percent of the source ffmpeg has encoded, from its `out_time_us` progress value. Null when
 * the duration is unknown, so callers can keep an indeterminate bar.
 */
export function transcodePercent(outTimeUs: number, durationSeconds: number | null): number | null {
  if (!durationSeconds || !Number.isFinite(outTimeUs)) return null
  return Math.min(100, Math.max(0, Math.floor((outTimeUs / 1e6 / durationSeconds) * 100)))
}

/**
 * Every rung up to the first one the source fits inside. That top rung keeps the source's own
 * resolution, so a 1920x800 film tops out at 1920x800 and nothing is ever upscaled.
 */
export function selectRenditions(source: Pick<Source, 'width' | 'height'>): Rung[] {
  const top = LADDER.findIndex((rung) => source.width <= rung.width && source.height <= rung.height)
  return top < 0 ? LADDER : LADDER.slice(0, top + 1)
}

/**
 * One ffmpeg run that encodes all renditions and writes
 * `{outputDir}/master.m3u8`, `{outputDir}/{rung}/index.m3u8` and `{outputDir}/audio/index.m3u8`.
 */
export function ffmpegArgs(
  inputPath: string,
  outputDir: string,
  source: Source,
  renditions: Rung[],
): string[] {
  const labels = renditions.map((_, i) => `[s${i}]`).join('')
  const scales = renditions.map(
    (rung, i) =>
      `[s${i}]scale=w='min(iw,${rung.width})':h='min(ih,${rung.height})'` +
      `:force_original_aspect_ratio=decrease:force_divisible_by=2,format=yuv420p[v${i}]`,
  )
  const hasAudio = source.audioIndex != null
  const group = hasAudio ? ',agroup:audio' : ''
  const variants = renditions.map((rung, i) => `v:${i}${group},name:${rung.name}`)
  if (hasAudio) variants.push('a:0,agroup:audio,name:audio,default:yes')
  return [
    '-hide_banner',
    '-nostdin',
    '-y',
    '-loglevel',
    'warning',
    '-nostats',
    '-progress',
    'pipe:1',
    // Often enough to drive the progress bar people watch while the video gets ready.
    '-stats_period',
    '5',
    '-i',
    inputPath,
    '-filter_complex',
    [`[0:${source.videoIndex}]split=${renditions.length}${labels}`, ...scales].join(';'),
    ...renditions.flatMap((_, i) => ['-map', `[v${i}]`]),
    ...(hasAudio ? ['-map', `0:${source.audioIndex}`] : []),
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-profile:v',
    'high',
    '-crf',
    '21',
    // Keyframes only at segment boundaries, so every rendition cuts at the same timestamps.
    '-sc_threshold',
    '0',
    '-force_key_frames',
    `expr:gte(t,n_forced*${SEGMENT_SECONDS})`,
    ...renditions.flatMap((rung, i) => [
      `-maxrate:v:${i}`,
      `${rung.maxrateKbps}k`,
      `-bufsize:v:${i}`,
      `${rung.maxrateKbps * 2}k`,
    ]),
    ...(hasAudio ? ['-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-ar', '48000'] : []),
    '-f',
    'hls',
    '-hls_time',
    String(SEGMENT_SECONDS),
    '-hls_playlist_type',
    'vod',
    '-hls_flags',
    'independent_segments',
    '-hls_segment_filename',
    `${outputDir}/%v/segment_%05d.ts`,
    '-master_pl_name',
    MASTER_PLAYLIST,
    '-var_stream_map',
    variants.join(' '),
    `${outputDir}/%v/index.m3u8`,
  ]
}

export function contentType(path: string): string {
  if (path.endsWith('.m3u8')) return 'application/vnd.apple.mpegurl'
  if (path.endsWith('.ts')) return 'video/mp2t'
  return 'application/octet-stream'
}
