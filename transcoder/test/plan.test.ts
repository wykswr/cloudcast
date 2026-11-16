import { describe, expect, it } from 'vitest'
import { contentType, ffmpegArgs, parseProbe, selectRenditions } from '../src/plan'

const names = (width: number, height: number) =>
  selectRenditions({ width, height }).map((rung) => rung.name)

describe('rendition ladder', () => {
  it.each([
    [1920, 1080, ['360p', '480p', '720p', '1080p']],
    [2560, 1440, ['360p', '480p', '720p', '1080p', '1440p']],
    [3840, 2160, ['360p', '480p', '720p', '1080p', '1440p', '2160p']],
    // Scope films are classed by width, not by their short height.
    [1920, 800, ['360p', '480p', '720p', '1080p']],
    // In-between sources keep their own resolution in the next rung up.
    [1600, 900, ['360p', '480p', '720p', '1080p']],
    [2560, 1080, ['360p', '480p', '720p', '1080p', '1440p']],
    [320, 240, ['360p']],
    [7680, 4320, ['360p', '480p', '720p', '1080p', '1440p', '2160p']],
  ])('%ix%i source', (width, height, expected) => {
    expect(names(width, height)).toEqual(expected)
  })
})

describe('probe parsing', () => {
  const probe = (streams: unknown[]) => JSON.stringify({ streams })
  it('skips cover art and picks the first audio stream', () => {
    expect(
      parseProbe(
        probe([
          {
            index: 0,
            codec_type: 'video',
            width: 600,
            height: 900,
            disposition: { attached_pic: 1 },
          },
          { index: 1, codec_type: 'subtitle' },
          {
            index: 2,
            codec_type: 'video',
            width: 1920,
            height: 800,
            disposition: { attached_pic: 0 },
          },
          { index: 3, codec_type: 'audio' },
          { index: 4, codec_type: 'audio' },
        ]),
      ),
    ).toEqual({ videoIndex: 2, audioIndex: 3, width: 1920, height: 800 })
  })
  it.each([
    [{ side_data_list: [{}, { rotation: -90 }] }, 1080, 1920],
    [{ tags: { rotate: '270' } }, 1080, 1920],
    [{ tags: { rotate: '180' } }, 1920, 1080],
  ])('applies rotation metadata %j', (extra, width, height) => {
    expect(
      parseProbe(probe([{ index: 0, codec_type: 'video', width: 1920, height: 1080, ...extra }])),
    ).toEqual({ videoIndex: 0, audioIndex: null, width, height })
  })
  it('rejects sources without video', () => {
    expect(() => parseProbe(probe([{ index: 0, codec_type: 'audio' }]))).toThrow('no video')
    expect(() => parseProbe('{}')).toThrow('no video')
  })
})

describe('ffmpeg arguments', () => {
  const source = { videoIndex: 2, audioIndex: 3, width: 1280, height: 720 }
  it('maps one scaled output per rendition plus a shared audio group', () => {
    const args = ffmpegArgs('/work/source', '/work/hls', source, selectRenditions(source))
    const value = (flag: string) => args[args.indexOf(flag) + 1]
    expect(value('-filter_complex')).toBe(
      '[0:2]split=3[s0][s1][s2];' +
        "[s0]scale=w='min(iw,640)':h='min(ih,360)':force_original_aspect_ratio=decrease:force_divisible_by=2,format=yuv420p[v0];" +
        "[s1]scale=w='min(iw,854)':h='min(ih,480)':force_original_aspect_ratio=decrease:force_divisible_by=2,format=yuv420p[v1];" +
        "[s2]scale=w='min(iw,1280)':h='min(ih,720)':force_original_aspect_ratio=decrease:force_divisible_by=2,format=yuv420p[v2]",
    )
    expect(args.filter((_, i) => args[i - 1] === '-map')).toEqual(['[v0]', '[v1]', '[v2]', '0:3'])
    expect(value('-maxrate:v:2')).toBe('2800k')
    expect(value('-bufsize:v:2')).toBe('5600k')
    expect(value('-var_stream_map')).toBe(
      'v:0,agroup:audio,name:360p v:1,agroup:audio,name:480p v:2,agroup:audio,name:720p a:0,agroup:audio,name:audio,default:yes',
    )
    expect(value('-hls_segment_filename')).toBe('/work/hls/%v/segment_%05d.ts')
    expect(value('-master_pl_name')).toBe('master.m3u8')
    expect(args.at(-1)).toBe('/work/hls/%v/index.m3u8')
  })
  it('omits audio options for silent sources', () => {
    const silent = { ...source, audioIndex: null }
    const args = ffmpegArgs('in', 'out', silent, selectRenditions(silent))
    expect(args).not.toContain('-c:a')
    expect(args.filter((_, i) => args[i - 1] === '-map')).toEqual(['[v0]', '[v1]', '[v2]'])
    expect(args[args.indexOf('-var_stream_map') + 1]).toBe(
      'v:0,name:360p v:1,name:480p v:2,name:720p',
    )
  })
})

it('labels HLS content types', () => {
  expect(contentType('1080p/index.m3u8')).toBe('application/vnd.apple.mpegurl')
  expect(contentType('1080p/segment_00001.ts')).toBe('video/mp2t')
  expect(contentType('other.bin')).toBe('application/octet-stream')
})
