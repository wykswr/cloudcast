import 'dotenv/config'
import { serve } from '@hono/node-server'
import { createApp } from './app'
import { createContainer } from './container'
import { getSettings } from './config'
import { logger } from './logger'

const settings = getSettings()
const app = createApp(createContainer(settings))
const server = serve({ fetch: app.fetch, port: settings.PORT }, (info) =>
  logger.info(`CloudCast API listening on http://localhost:${info.port}`),
)
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(() => process.exit(0)))
}
