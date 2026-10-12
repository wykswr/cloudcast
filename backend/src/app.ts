import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { methodNotAllowed } from 'hono/method-not-allowed'
import type { AppContainer, AppEnv } from './container'
import { redirectDocsTrailingSlash, registerDocs } from './docs'
import { ApiError } from './errors'
import { logger } from './logger'
import { apiCors } from './middleware/cors'
import { videoRoutes } from './routes/videos'

const healthRoute = createRoute({
  method: 'get',
  path: '/health',
  responses: {
    200: {
      description: 'Healthy',
      content: { 'application/json': { schema: z.object({ status: z.string() }) } },
    },
  },
})

export function createApp(container: AppContainer) {
  const app = new OpenAPIHono<AppEnv>({ strict: false })

  app.use('*', redirectDocsTrailingSlash)
  app.use('*', apiCors(container.settings.CORS_ALLOW_ORIGINS))
  app.use(
    '*',
    methodNotAllowed({
      app,
      onMethodNotAllowed: (c, methods) =>
        c.json({ detail: 'Method Not Allowed' }, 405, { Allow: methods.join(', ') }),
    }),
  )

  app.onError((error, c) => {
    if (error instanceof ApiError) return c.json({ detail: error.detail }, error.status)
    logger.error('Unhandled request error', { error, method: c.req.method, path: c.req.path })
    return c.json({ detail: 'Internal Server Error' }, 500)
  })
  app.notFound((c) => c.json({ detail: 'Not Found' }, 404))

  app.openapi(healthRoute, (c) => c.json({ status: 'ok' }))
  app.route('/videos', videoRoutes(container))
  registerDocs(app)
  return app
}
