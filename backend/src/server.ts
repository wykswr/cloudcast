import 'dotenv/config'
import { serve } from '@hono/node-server'
import { createApp } from './app'
import { createContainer } from './container'
import { getSettings } from './config'

const app = createApp(createContainer(getSettings()))
const server = serve({ fetch: app.fetch, port: 8000 }, info => console.log(`CloudCast API listening on http://localhost:${info.port}`))
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => server.close(() => process.exit(0)))
