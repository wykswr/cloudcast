import type { MiddlewareHandler } from 'hono'
import type { AppEnv } from '../container'
import { ApiError } from '../errors'

const JSON_CONTENT_TYPE = /^application\/json(?:;|$)/i

/**
 * Rejects non-JSON or malformed bodies with 422. Without this, the OpenAPI validator
 * validates a non-JSON body as `{}` and reports malformed JSON as a 400.
 */
export const requireJsonBody: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!JSON_CONTENT_TYPE.test(c.req.header('Content-Type') || '')) {
    throw new ApiError(422, 'Request validation failed')
  }
  try {
    // Hono caches the parsed body, so the route validator reuses this parse.
    await c.req.json()
  } catch {
    throw new ApiError(422, 'Invalid JSON body')
  }
  await next()
}
