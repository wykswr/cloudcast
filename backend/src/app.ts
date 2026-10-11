import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { swaggerUI } from '@hono/swagger-ui'
import { cors } from 'hono/cors'
import { methodNotAllowed } from 'hono/method-not-allowed'
import { ApiError } from './errors'
import type { AppContainer, AppEnv } from './container'
import { videoRoutes } from './routes/videos'

export function createApp(container: AppContainer) {
  const app = new OpenAPIHono<AppEnv>({ strict: false })
  const origins = container.settings.CORS_ALLOW_ORIGINS.split(',').map(origin => origin.trim()).filter(Boolean)
  app.use('*', async (c, next) => {
    const path = new URL(c.req.url).pathname
    if (path === '/docs/' || path === '/redoc/') return c.redirect(`../${path.split('/')[1]}`, 307)
    await next()
  })
  const methods = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
  app.use('*', async (c, next) => {
    await next()
    const requestedMethod = c.req.header('Access-Control-Request-Method')
    if (c.req.method === 'OPTIONS' && requestedMethod) {
      const originAllowed = origins.includes(c.req.header('Origin') || '')
      const methodAllowed = methods.includes(requestedMethod)
      c.res = new Response(originAllowed && methodAllowed ? 'OK' : 'Disallowed CORS request', {
        status: originAllowed && methodAllowed ? 200 : 400,
        headers: c.res.headers,
      })
    }
  })
  app.use('*', cors({ origin: origins, credentials: true, allowMethods: methods, maxAge: 600 }))
  app.use('*', methodNotAllowed({ app, onMethodNotAllowed: (c, methods) =>
    c.json({ detail: 'Method Not Allowed' }, 405, { Allow: methods.join(', ') }),
  }))
  app.onError((error, c) => {
    if (error instanceof ApiError) return c.json({ detail: error.detail }, error.status)
    console.error('Unhandled request error', error)
    return c.json({ detail: 'Internal Server Error' }, 500)
  })
  app.notFound(c => c.json({ detail: 'Not Found' }, 404))
  app.openapi(createRoute({ method: 'get', path: '/health', responses: {
    200: { description: 'Healthy', content: { 'application/json': { schema: z.object({ status: z.string() }) } } },
  } }), c => c.json({ status: 'ok' }))
  app.route('/videos', videoRoutes(container))
  app.openAPIRegistry.registerComponent('securitySchemes', 'BearerAuth', { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
  app.doc('/openapi.json', { openapi: '3.0.0', info: { title: 'CloudCast API', version: '0.1.0' }, servers: [{ url: '.' }] })
  // Relative links preserve API Gateway stage prefixes and custom domain mappings.
  app.get('/docs', swaggerUI({ url: './openapi.json' }))
  app.get('/redoc', c => c.html('<!doctype html><html><head><title>CloudCast API</title></head><body><redoc spec-url="./openapi.json"></redoc><script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"></script></body></html>'))
  return app
}
