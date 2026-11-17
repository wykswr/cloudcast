import { describe, expect, it, vi } from 'vitest'
import { readConfig, runJob } from '../src/job'
import type { JobDeps } from '../src/job'

const env = {
  RAW_BUCKET: 'raw',
  RAW_KEY: 'owner/video/raw/holiday.final.mp4',
  PROCESSED_BUCKET: 'processed',
  MANIFEST_KEY: 'owner/video/hls/holiday.final.m3u8',
}
const target = { VIDEOS_TABLE: 'videos', USER_ID: 'owner', VIDEO_ID: 'video' }
const probe = JSON.stringify({
  format: { duration: '120.000000' },
  streams: [
    { index: 0, codec_type: 'video', width: 1280, height: 720 },
    { index: 1, codec_type: 'audio' },
  ],
})
function fakeDeps(): { [K in keyof JobDeps]: ReturnType<typeof vi.fn<JobDeps[K]>> } {
  return {
    download: vi.fn<JobDeps['download']>().mockResolvedValue(),
    exec: vi.fn<JobDeps['exec']>().mockImplementation(async (command, _args, onLine) => {
      if (command === 'ffprobe') return probe
      onLine?.('frame=10')
      onLine?.('out_time_us=30000000')
      onLine?.('out_time=00:00:30.000000')
      // Repeats and stalls do not send the same percent twice.
      onLine?.('out_time_us=30000000')
      onLine?.('out_time_us=60000000')
      onLine?.('out_time=00:01:00.000000')
      return ''
    }),
    listFiles: vi
      .fn<JobDeps['listFiles']>()
      .mockResolvedValue(['master.m3u8', '720p/index.m3u8', '720p/segment_00000.ts']),
    upload: vi.fn<JobDeps['upload']>().mockResolvedValue(),
    reportProgress: vi.fn<JobDeps['reportProgress']>().mockResolvedValue(),
    log: vi.fn<JobDeps['log']>(),
  }
}

describe('transcode job', () => {
  it('reads its configuration from the environment', () => {
    expect(readConfig(env, '/work')).toEqual({
      rawBucket: 'raw',
      rawKey: env.RAW_KEY,
      processedBucket: 'processed',
      manifestKey: env.MANIFEST_KEY,
      workDir: '/work',
    })
    expect(() => readConfig({ ...env, MANIFEST_KEY: '' }, '/work')).toThrow('MANIFEST_KEY')
    expect(readConfig({ ...env, ...target }, '/work').progress).toEqual({
      table: 'videos',
      userId: 'owner',
      videoId: 'video',
    })
    expect(readConfig({ ...env, ...target, VIDEO_ID: '' }, '/work').progress).toBeUndefined()
  })
  it('reports progress as it encodes and uploads, only ever going up', async () => {
    const deps = fakeDeps()
    await runJob(readConfig({ ...env, ...target }, '/work'), deps)
    const progress = { table: 'videos', userId: 'owner', videoId: 'video' }
    // 0 at start, 25% and 50% of the 90% encode share, 90 when ffmpeg ends, then the two variant
    // files of three uploads take it to 93 and 96.
    expect(deps.reportProgress.mock.calls).toEqual(
      [0, 22, 45, 90, 93, 96].map((percent) => [progress, percent]),
    )
    expect(deps.reportProgress.mock.invocationCallOrder.at(-1)).toBeLessThan(
      deps.log.mock.invocationCallOrder.at(-1)!,
    )
  })
  it('keeps going when a progress report fails', async () => {
    const deps = fakeDeps()
    deps.reportProgress.mockRejectedValueOnce(new Error('throttled'))
    await runJob(readConfig({ ...env, ...target }, '/work'), deps)
    expect(deps.log).toHaveBeenCalledWith('Progress report failed', { error: 'throttled' })
    expect(deps.upload).toHaveBeenCalledTimes(3)
  })
  it('only logs progress when the workflow did not say which video it is', async () => {
    const deps = fakeDeps()
    await runJob(readConfig(env, '/work'), deps)
    expect(deps.reportProgress).not.toHaveBeenCalled()
  })
  it('downloads, transcodes, then uploads variants before the renamed master playlist', async () => {
    const deps = fakeDeps()
    await runJob(readConfig(env, '/work'), deps)
    expect(deps.download).toHaveBeenCalledWith('raw', env.RAW_KEY, '/work/source')
    expect(deps.exec.mock.calls.map(([command]) => command)).toEqual(['ffprobe', 'ffmpeg'])
    expect(deps.exec.mock.calls[1][1]).toContain('/work/hls/%v/index.m3u8')
    expect(deps.listFiles).toHaveBeenCalledWith('/work/hls')
    expect(deps.upload.mock.calls).toEqual([
      [
        'processed',
        'owner/video/hls/720p/index.m3u8',
        '/work/hls/720p/index.m3u8',
        'application/vnd.apple.mpegurl',
      ],
      [
        'processed',
        'owner/video/hls/720p/segment_00000.ts',
        '/work/hls/720p/segment_00000.ts',
        'video/mp2t',
      ],
      ['processed', env.MANIFEST_KEY, '/work/hls/master.m3u8', 'application/vnd.apple.mpegurl'],
    ])
    expect(deps.exec.mock.calls[0][1]).toContain('-show_format')
    expect(deps.log).toHaveBeenCalledWith('Progress', { position: '00:01:00.000000' })
    expect(deps.log).toHaveBeenCalledTimes(6)
  })
  it('uploads nothing when the transcode fails', async () => {
    const deps = fakeDeps()
    deps.exec
      .mockResolvedValueOnce(probe)
      .mockRejectedValueOnce(new Error('ffmpeg failed (exit 1)'))
    await expect(runJob(readConfig(env, '/work'), deps)).rejects.toThrow('exit 1')
    expect(deps.upload).not.toHaveBeenCalled()
  })
  it('leaves the master playlist out when a variant upload fails', async () => {
    const deps = fakeDeps()
    deps.upload.mockRejectedValueOnce(new Error('S3 failed'))
    await expect(runJob(readConfig(env, '/work'), deps)).rejects.toThrow('S3 failed')
    expect(deps.upload.mock.calls.map(([, key]) => key)).not.toContain(env.MANIFEST_KEY)
  })
})
