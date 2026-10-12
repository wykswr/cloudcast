import { generateKeyPairSync, verify, constants } from 'node:crypto'
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm'
import { expect, it } from 'vitest'
import { CloudFrontURLSigner } from '../src/services/cloudfront'
import { settings, mockAwsSend } from './fixtures'

it('decrypts and caches SSM key; signs a wildcard HLS policy with RSA-SHA1/PKCS1v15', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const pem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString()
  const ssm = new SSMClient({ region: settings.AWS_REGION })
  const send = mockAwsSend(ssm).mockResolvedValue({
    Parameter: { Value: pem.replace(/\n/g, '\\n') },
  })
  const signer = new CloudFrontURLSigner(settings, ssm)
  const url = new URL(await signer.sign('/owner/video/hls/holiday.final.m3u8'))
  const decode = (value: string) =>
    Buffer.from(value.replace(/-/g, '+').replace(/_/g, '=').replace(/~/g, '/'), 'base64')
  const policy = decode(url.searchParams.get('Policy')!)
  const parsed = JSON.parse(policy.toString())
  expect(parsed.Statement[0].Resource).toBe('https://media.example.com/owner/video/hls/*')
  expect(parsed.Statement[0].Condition.DateLessThan['AWS:EpochTime']).toBeCloseTo(
    Date.now() / 1000 + 3600,
    -1,
  )
  expect(url.pathname).toBe('/owner/video/hls/holiday.final.m3u8')
  expect(url.searchParams.get('Key-Pair-Id')).toBe('key-id')
  expect(
    verify(
      'RSA-SHA1',
      policy,
      { key: publicKey, padding: constants.RSA_PKCS1_PADDING },
      decode(url.searchParams.get('Signature')!),
    ),
  ).toBe(true)
  expect(send.mock.calls[0][0]).toBeInstanceOf(GetParameterCommand)
  expect(send.mock.calls[0][0].input).toEqual({ Name: '/test/key', WithDecryption: true })
  await signer.sign('owner/video/hls/variant.m3u8')
  expect(send).toHaveBeenCalledTimes(1)
})
it('retries key loading after an SSM failure', async () => {
  const ssm = new SSMClient({ region: settings.AWS_REGION })
  const send = mockAwsSend(ssm)
    .mockRejectedValueOnce(new Error('SSM unavailable'))
    .mockResolvedValueOnce({ Parameter: { Value: 'invalid' } })
  const signer = new CloudFrontURLSigner(settings, ssm)
  await expect(signer.sign('owner/video/hls/master.m3u8')).rejects.toThrow('SSM unavailable')
  await expect(signer.sign('owner/video/hls/master.m3u8')).rejects.toThrow()
  expect(send).toHaveBeenCalledTimes(2)
})
