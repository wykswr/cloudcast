import type { OpenAPIHono } from '@hono/zod-openapi'
import { swaggerUI } from '@hono/swagger-ui'
import type { MiddlewareHandler } from 'hono'
import type { AppEnv } from './container'

const REDOC_HTML = `<!doctype html>
<html>
  <head><title>CloudCast API</title></head>
  <body>
    <redoc spec-url="./openapi.json"></redoc>
    <script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"></script>
  </body>
</html>`

/** Serves `/openapi.json`, Swagger UI at `/docs`, and ReDoc at `/redoc`. */
export function registerDocs(app: OpenAPIHono<AppEnv>) {
  app.openAPIRegistry.registerComponent('securitySchemes', 'BearerAuth', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
  })
  // Relative URLs preserve API Gateway stage prefixes and custom domain mappings.
  app.doc('/openapi.json', {
    openapi: '3.0.0',
    info: { title: 'CloudCast API', version: '0.1.0' },
    servers: [{ url: '.' }],
  })
  app.get('/docs', swaggerUI({ url: './openapi.json' }))
  app.get('/redoc', (c) => c.html(REDOC_HTML))
}

/** Redirects `/docs/` and `/redoc/` so their relative `./openapi.json` links resolve. */
export const redirectDocsTrailingSlash: MiddlewareHandler = async (c, next) => {
  const path = new URL(c.req.url).pathname
  if (path === '/docs/' || path === '/redoc/') return c.redirect(`../${path.split('/')[1]}`, 307)
  await next()
}
