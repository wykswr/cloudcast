import { generateKeyPair, exportJWK, SignJWT } from 'jose'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CognitoTokenVerifier } from '../src/auth'
import { settings } from './fixtures'

const issuer = `https://cognito-idp.${settings.AWS_REGION}.amazonaws.com/${settings.COGNITO_USER_POOL_ID}`
const keys = await generateKeyPair('RS256')
const jwk = { ...(await exportJWK(keys.publicKey)), kid: 'key' }
const fetcher = () =>
  vi
    .fn<typeof fetch>()
    .mockImplementation(async () => new Response(JSON.stringify({ keys: [jwk] })))
async function token(claims: Record<string, unknown> = {}, kid = 'key') {
  return new SignJWT({
    sub: 'owner',
    aud: 'client',
    email: 'owner@example.com',
    'cognito:groups': ['admin'],
    ...claims,
  })
    .setProtectedHeader({ alg: 'RS256', kid })
    .setIssuer(issuer)
    .setExpirationTime('1h')
    .sign(keys.privateKey)
}
afterEach(() => vi.useRealTimers())
describe('Cognito verifier', () => {
  it('accepts ID/access tokens and caches JWKS through its configured TTL', async () => {
    const fetch = fetcher()
    const verifier = new CognitoTokenVerifier(settings, fetch)
    expect(await verifier.verify(await token())).toEqual({
      id: 'owner',
      email: 'owner@example.com',
      groups: ['admin'],
    })
    expect((await verifier.verify(await token({ aud: undefined, client_id: 'client' }))).id).toBe(
      'owner',
    )
    expect(fetch).toHaveBeenCalledTimes(1)
    vi.useFakeTimers()
    vi.setSystemTime(Date.now() + (settings.JWKS_CACHE_SECONDS + 1) * 1000)
    await verifier.verify(await token())
    expect(fetch).toHaveBeenCalledTimes(2)
  })
  it('shares concurrent JWKS fetches and reports network failure as 503', async () => {
    const fetch = fetcher()
    const verifier = new CognitoTokenVerifier(settings, fetch)
    const value = await token()
    await Promise.all([verifier.verify(value), verifier.verify(value)])
    expect(fetch).toHaveBeenCalledTimes(1)
    const failed = new CognitoTokenVerifier(
      settings,
      vi.fn<typeof globalThis.fetch>().mockRejectedValue(new Error('offline')),
    )
    await expect(failed.verify(value)).rejects.toMatchObject({
      status: 503,
      detail: 'Unable to fetch Cognito JWKS',
    })
  })
  it('reports unusable JWKS responses as 503', async () => {
    const value = await token()
    for (const response of [
      new Response('nope', { status: 500 }),
      new Response(JSON.stringify({ keys: 'x' })),
    ]) {
      const verifier = new CognitoTokenVerifier(
        settings,
        vi.fn<typeof fetch>().mockResolvedValue(response),
      )
      await expect(verifier.verify(value)).rejects.toMatchObject({ status: 503 })
    }
  })
  it('requires a subject and keeps only string groups and email', async () => {
    const verifier = new CognitoTokenVerifier(settings, fetcher())
    await expect(verifier.verify(await token({ sub: undefined }))).rejects.toMatchObject({
      status: 401,
    })
    expect(
      await verifier.verify(await token({ email: 7, 'cognito:groups': ['admin', 3] })),
    ).toEqual({ id: 'owner', email: null, groups: ['admin'] })
    expect((await verifier.verify(await token({ 'cognito:groups': 'admin' }))).groups).toEqual([])
  })
  it('rejects malformed headers, unknown keys, audience mismatch, expiry, issuer, and signature', async () => {
    const verifier = new CognitoTokenVerifier(settings, fetcher())
    await expect(verifier.verify('bad')).rejects.toMatchObject({
      status: 401,
      detail: 'Invalid token header',
    })
    await expect(verifier.verify(await token({}, 'unknown'))).rejects.toMatchObject({
      status: 401,
      detail: 'Unknown token key',
    })
    await expect(verifier.verify(await token({ aud: 'other' }))).rejects.toMatchObject({
      status: 401,
      detail: 'Token audience does not match client configuration',
    })
    const expired = await new SignJWT({ sub: 'owner', aud: 'client' })
      .setProtectedHeader({ alg: 'RS256', kid: 'key' })
      .setIssuer(issuer)
      .setExpirationTime(1)
      .sign(keys.privateKey)
    await expect(verifier.verify(expired)).rejects.toMatchObject({ status: 401 })
    const wrongIssuer = await new SignJWT({ sub: 'owner', aud: 'client' })
      .setProtectedHeader({ alg: 'RS256', kid: 'key' })
      .setIssuer('wrong')
      .setExpirationTime('1h')
      .sign(keys.privateKey)
    await expect(verifier.verify(wrongIssuer)).rejects.toMatchObject({ status: 401 })
    const otherKeys = await generateKeyPair('RS256')
    const wrongSignature = await new SignJWT({ sub: 'owner', aud: 'client' })
      .setProtectedHeader({ alg: 'RS256', kid: 'key' })
      .setIssuer(issuer)
      .setExpirationTime('1h')
      .sign(otherKeys.privateKey)
    await expect(verifier.verify(wrongSignature)).rejects.toMatchObject({ status: 401 })
  })
})
