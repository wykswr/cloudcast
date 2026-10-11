import { handle } from '@hono/aws-lambda'
import type { LambdaEvent } from '@hono/aws-lambda'
import type { APIGatewayProxyEvent, Context } from 'aws-lambda'
import { createApp } from './app'
import { createContainer } from './container'
import type { AppContainer } from './container'
import { getSettings } from './config'

export function createLambdaHandler(factory: () => AppContainer = () => createContainer(getSettings())) {
  let adapter: ReturnType<typeof handle> | undefined
  return async (event: APIGatewayProxyEvent, context: Context) => {
    adapter ??= handle(createApp(factory()))
    // The adapter handles REST v1 null fields; its event type omits those nulls.
    return adapter(event as unknown as LambdaEvent, context)
  }
}
export const handler = createLambdaHandler()
