import { posix } from 'node:path'
import { MASTER_PLAYLIST, contentType, ffmpegArgs, parseProbe, selectRenditions } from './plan'

export type JobConfig = {
  rawBucket: string
  rawKey: string
  processedBucket: string
  /** Where the master playlist must land; variant playlists and segments go beside it. */
  manifestKey: string
  /** Scratch directory on the task's ephemeral storage. */
  workDir: string
}

export type JobDeps = {
  download(bucket: string, key: string, path: string): Promise<void>
  /** Runs a command to completion and resolves with its stdout. */
  exec(command: string, args: string[], onLine?: (line: string) => void): Promise<string>
  /** Relative paths of every file under `dir`. */
  listFiles(dir: string): Promise<string[]>
  upload(bucket: string, key: string, path: string, contentType: string): Promise<void>
  log(message: string, details?: Record<string, unknown>): void
}

const UPLOAD_CONCURRENCY = 16

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
  }
}

export async function runJob(config: JobConfig, deps: JobDeps): Promise<void> {
  const inputPath = posix.join(config.workDir, 'source')
  const outputDir = posix.join(config.workDir, 'hls')
  deps.log('Downloading source', { bucket: config.rawBucket, key: config.rawKey })
  await deps.download(config.rawBucket, config.rawKey, inputPath)

  const source = parseProbe(
    await deps.exec('ffprobe', [
      '-v',
      'error',
      '-print_format',
      'json',
      '-show_streams',
      inputPath,
    ]),
  )
  const renditions = selectRenditions(source)
  deps.log('Transcoding', { source, renditions: renditions.map((rung) => rung.name) })
  await deps.exec('ffmpeg', ffmpegArgs(inputPath, outputDir, source, renditions), (line) => {
    if (line.startsWith('out_time=')) deps.log('Progress', { position: line.slice(9) })
  })

  const prefix = config.manifestKey.slice(0, config.manifestKey.lastIndexOf('/') + 1)
  const files = (await deps.listFiles(outputDir)).filter((file) => file !== MASTER_PLAYLIST)
  deps.log('Uploading', { files: files.length + 1, prefix })
  let next = 0
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
  deps.log('Done', { manifestKey: config.manifestKey })
}
