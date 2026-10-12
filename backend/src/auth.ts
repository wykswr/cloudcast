import { createLocalJWKSet, decodeProtectedHeader, jwtVerify } from 'jose'
import type { JSONWebKeySet } from 'jose'
import { ApiError } from './errors'
import type { Settings } from './config'

export type AuthenticatedUser = { id: string; email?: string | null; groups: string[] }
export interface TokenVerifier {
  verify(token: string): Promise<AuthenticatedUser>
}

export class CognitoTokenVerifier implements TokenVerifier {
  private readonly issuer: string
  private keys?: JSONWebKeySet
  private expiresAt = 0
  private pending?: Promise<JSONWebKeySet>
  constructor(
    private settings: Settings,
    private fetcher: typeof fetch = fetch,
  ) {
    this.issuer = `https://cognito-idp.${settings.AWS_REGION}.amazonaws.com/${settings.COGNITO_USER_POOL_ID}`
  }

  private async getKeys(): Promise<JSONWebKeySet> {
    if (this.keys && Date.now() < this.expiresAt) return this.keys
    if (this.pending) return this.pending
    this.pending = (async () => {
      try {
        const response = await this.fetcher(`${this.issuer}/.well-known/jwks.json`)
        if (!response.ok) throw new Error(`JWKS request failed: ${response.status}`)
        const data = (await response.json()) as JSONWebKeySet
        if (!Array.isArray(data.keys)) throw new Error('Invalid JWKS response')
        this.keys = data
        this.expiresAt = Date.now() + this.settings.JWKS_CACHE_SECONDS * 1000
        return data
      } catch (error) {
        throw new ApiError(503, 'Unable to fetch Cognito JWKS', { cause: error })
      }
    })()
    try {
      return await this.pending
    } finally {
      this.pending = undefined
    }
  }

  async verify(token: string): Promise<AuthenticatedUser> {
    const keys = await this.getKeys()
    let header
    try {
      header = decodeProtectedHeader(token)
    } catch (error) {
      throw new ApiError(401, 'Invalid token header', { cause: error })
    }
    if (!keys.keys.some((key) => key.kid === header.kid))
      throw new ApiError(401, 'Unknown token key')
    let claims
    try {
      const result = await jwtVerify(token, createLocalJWKSet(keys), {
        issuer: this.issuer,
        algorithms: ['RS256'],
      })
      claims = result.payload
    } catch (error) {
      throw new ApiError(401, 'Invalid or expired token', { cause: error })
    }
    if ((claims.aud || claims.client_id) !== this.settings.COGNITO_CLIENT_ID) {
      throw new ApiError(401, 'Token audience does not match client configuration')
    }
    if (typeof claims.sub !== 'string') throw new ApiError(401, 'Invalid or expired token')
    const groups = claims['cognito:groups']
    return {
      id: claims.sub,
      email: typeof claims.email === 'string' ? claims.email : null,
      groups: Array.isArray(groups)
        ? groups.filter((group): group is string => typeof group === 'string')
        : [],
    }
  }
}
