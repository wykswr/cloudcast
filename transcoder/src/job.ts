import { posix } from 'node:path'
import {
  MASTER_PLAYLIST,
  contentType,
  ffmpegArgs,
  parseDuration,
  parseProbe,
  selectRenditions,
  transcodePercent,
} from './plan'

/** The Videos table item whose `processing_percent` the job keeps up to date. */
export type ProgressTarget = { table: string; userId: string; videoId: string }

export type JobConfig = {
  rawBucket: string
  rawKey: string
  processedBucket: string
  /** Where the master playlist must land; variant playlists and segments go beside it. */
  manifestKey: string
  /** Scratch directory on the task's ephemeral storage. */
  workDir: string
  /** Absent when the workflow does not pass the table and ids; progress is then only logged. */
  progress?: ProgressTarget
}

export type JobDeps = {
  download(bucket: string, key: string, path: string): Promise<void>
  /** Runs a command to completion and resolves with its stdout. */
  exec(command: string, args: string[], onLine?: (line: string) => void): Promise<string>
  /** Relative paths of every file under `dir`. */
  listFiles(dir: string): Promise<string[]>
  upload(bucket: string, key: string, path: string, contentType: string): Promise<void>
  /** Records how far along the job is, 0-99. */
  reportProgress(target: ProgressTarget, percent: number): Promise<void>
  log(message: string, details?: Record<string, unknown>): void
}

const UPLOAD_CONCURRENCY = 16
/** Share of the overall bar the encode takes; uploading the output fills the rest up to 99. */
const TRANSCODE_SHARE = 90
/** The workflow marks the video ready; the job itself never claims to be finished. */
const MAX_PERCENT = 99

/**
 * Sends progress only when the whole percent goes up, one write at a time and in order. A failed
 * write is logged and never fails the job: the bar is a nicety, the transcode is not.
 */
function progressReporter(config: JobConfig, deps: JobDeps) {
  let last = -1
  let pending = Promise.resolve()
  return {
    report(percent: number) {
      const value = Math.min(MAX_PERCENT, Math.max(0, Math.floor(percent)))
      const target = config.progress
      if (!target || value <= last) return
      last = value
      pending = pending
        .then(() => deps.reportProgress(target, value))
        .catch((error: unknown) =>
          deps.log('Progress report failed', {
            error: error instanceof Error ? error.message : String(error),
          }),
        )
    },
    flush: () => pending,
  }
}

export function readConfig(env: Record<string, string | undefined>, workDir: string): JobConfig {
  const required = (name: string) => {
    const value = env[name]
    if (!value) throw new Error(`Missing environment variable ${name}`)
    return value
  }
  return {
    rawBucket: required('RAW_BUCKET'),
    rawKey: required('RAW_KEY'),
    processedBucket: required('PROCESSED_BUCKET'),
    manifestKey: required('MANIFEST_KEY'),
    workDir,
    ...(env.VIDEOS_TABLE && env.USER_ID && env.VIDEO_ID
      ? { progress: { table: env.VIDEOS_TABLE, userId: env.USER_ID, videoId: env.VIDEO_ID } }
      : {}),
  }
}

export async function runJob(config: JobConfig, deps: JobDeps): Promise<void> {
  const inputPath = posix.join(config.workDir, 'source')
  const outputDir = posix.join(config.workDir, 'hls')
  const progress = progressReporter(config, deps)
  // Starts the bar again from zero if this is a retry after a Spot interruption.
  progress.report(0)
  deps.log('Downloading source', { bucket: config.rawBucket, key: config.rawKey })
  await deps.download(config.rawBucket, config.rawKey, inputPath)

  const probe = await deps.exec('ffprobe', [
    '-v',
    'error',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    inputPath,
  ])
  const source = parseProbe(probe)
  const durationSeconds = parseDuration(probe)
  const renditions = selectRenditions(source)
  deps.log('Transcoding', {
    source,
    durationSeconds,
    renditions: renditions.map((rung) => rung.name),
  })
  await deps.exec('ffmpeg', ffmpegArgs(inputPath, outputDir, source, renditions), (line) => {
    if (line.startsWith('out_time=')) deps.log('Progress', { position: line.slice(9) })
    else if (line.startsWith('out_time_us=')) {
      const percent = transcodePercent(Number(line.slice(12)), durationSeconds)
      if (percent != null) progress.report((percent * TRANSCODE_SHARE) / 100)
    }
  })
  progress.report(TRANSCODE_SHARE)

  const prefix = config.manifestKey.slice(0, config.manifestKey.lastIndexOf('/') + 1)
  const files = (await deps.listFiles(outputDir)).filter((file) => file !== MASTER_PLAYLIST)
  deps.log('Uploading', { files: files.length + 1, prefix })
  let next = 0
  let uploaded = 0
  await Promise.all(
    Array.from({ length: UPLOAD_CONCURRENCY }, async () => {
      while (next < files.length) {
        const file = files[next++]
        await deps.upload(
          config.processedBucket,
          prefix + file,
          posix.join(outputDir, file),
          contentType(file),
        )
        uploaded += 1
        progress.report(
          TRANSCODE_SHARE + ((MAX_PERCENT - TRANSCODE_SHARE) * uploaded) / (files.length + 1),
        )
      }
    }),
  )
  // The master playlist goes last, under the name the backend recorded, so it never points at
  // variants that are not there yet.
  await deps.upload(
    config.processedBucket,
    config.manifestKey,
    posix.join(outputDir, MASTER_PLAYLIST),
    contentType(MASTER_PLAYLIST),
  )
  await progress.flush()
  deps.log('Done', { manifestKey: config.manifestKey })
}
