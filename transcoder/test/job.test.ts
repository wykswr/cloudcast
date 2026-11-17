import { describe, expect, it, vi } from 'vitest'
import { readConfig, runJob } from '../src/job'
import type { JobDeps } from '../src/job'

const env = {
  RAW_BUCKET: 'raw',
  RAW_KEY: 'owner/video/raw/holiday.final.mp4',
  PROCESSED_BUCKET: 'processed',
  MANIFEST_KEY: 'owner/video/hls/holiday.final.m3u8',
}
const probe = JSON.stringify({
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
      onLine?.('out_time=00:01:00.000000')
      return ''
    }),
    listFiles: vi
      .fn<JobDeps['listFiles']>()
      .mockResolvedValue(['master.m3u8', '720p/index.m3u8', '720p/segment_00000.ts']),
    upload: vi.fn<JobDeps['upload']>().mockResolvedValue(),
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
    expect(deps.log).toHaveBeenCalledWith('Progress', { position: '00:01:00.000000' })
    expect(deps.log).toHaveBeenCalledTimes(5)
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
