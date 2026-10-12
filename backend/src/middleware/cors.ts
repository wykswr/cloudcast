import { cors } from 'hono/cors'

/**
 * CORS for the local dev server. When deployed, API Gateway answers preflight requests
 * itself (`Cors` in template.yaml), so this only adds headers to actual responses there.
 */
export function apiCors(allowOrigins: string) {
  const origins = allowOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
  return cors({
    origin: origins,
    credentials: true,
    allowMethods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    maxAge: 600,
  })
}
