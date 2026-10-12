import type { MiddlewareHandler } from 'hono'
import { matchedRoutes } from 'hono/route'
import type { TokenVerifier } from '../auth'
import type { AppEnv } from '../container'
import { ApiError } from '../errors'

/** Requires a valid Cognito bearer token and stores the caller as `c.get('user')`. */
export function requireUser(tokenVerifier: TokenVerifier): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    // Only wildcard middleware matched: let unknown paths 404 before demanding a token.
    if (!matchedRoutes(c).some((route) => route.method !== 'ALL')) return c.notFound()
    const match = /^Bearer\s+(.+)$/i.exec(c.req.header('Authorization') || '')
    if (!match) throw new ApiError(401, 'Missing Authorization header')
    c.set('user', await tokenVerifier.verify(match[1]))
    await next()
  }
}

/** Requires the `admin` Cognito group; run after `requireUser`. */
export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get('user').groups.includes('admin')) {
    throw new ApiError(403, 'Admin privileges required')
  }
  await next()
}
