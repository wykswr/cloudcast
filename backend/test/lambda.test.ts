import { expect, it, vi } from 'vitest'
import type { APIGatewayProxyEvent, Context } from 'aws-lambda'
import { createLambdaHandler } from '../src/lambda'
import { mockContainer } from './fixtures'

export function restEvent(path: string, method = 'GET', body: unknown = null): APIGatewayProxyEvent {
  return {
    httpMethod: method, path, resource: '/{proxy+}', headers: { Host: 'api.execute-api.us-west-2.amazonaws.com', Authorization: 'Bearer token', 'Content-Type': 'application/json' },
    multiValueHeaders: {}, queryStringParameters: null, multiValueQueryStringParameters: null,
    pathParameters: { proxy: path.slice(1) }, stageVariables: null, body: body === null ? null : JSON.stringify(body), isBase64Encoded: false,
    requestContext: { accountId: '123', apiId: 'api', authorizer: {}, httpMethod: method, identity: {} as APIGatewayProxyEvent['requestContext']['identity'],
      path: `/dev${path}`, stage: 'dev', requestId: 'request', requestTimeEpoch: 1000, resourceId: 'resource', resourcePath: '/{proxy+}', protocol: 'HTTP/1.1', domainName: 'api.execute-api.us-west-2.amazonaws.com' },
  }
}
const context = {} as Context
it('handles REST v1 stage paths, JSON and base64 bodies while reusing its container', async () => {
  const container = mockContainer()
  const factory = vi.fn(() => container)
  const handler = createLambdaHandler(factory)
  const result = await handler(restEvent('/videos'), context)
  expect(result.statusCode).toBe(200)
  expect(JSON.parse(result.body).items[0].id).toBe('video')
  const docs = await handler(restEvent('/docs'), context)
  expect(docs.body).toContain('./openapi.json')
  expect(new URL('./openapi.json', 'https://api.execute-api.us-west-2.amazonaws.com/dev/docs').pathname).toBe('/dev/openapi.json')
  const event = restEvent('/videos/upload/sign-part', 'POST', { videoId: 'video', uploadId: 'upload', partNumber: 1 })
  event.isBase64Encoded = true
  event.body = Buffer.from(event.body!).toString('base64')
  expect((await handler(event, context)).statusCode).toBe(200)
  expect(factory).toHaveBeenCalledTimes(1)
})
it('returns JSON errors and handles preflight through the REST adapter', async () => {
  const handler = createLambdaHandler(mockContainer)
  const event = restEvent('/videos')
  event.headers = {}
  const result = await handler(event, context)
  expect(result.statusCode).toBe(401)
  expect(JSON.parse(result.body)).toEqual({ detail: 'Missing Authorization header' })
  const options = restEvent('/videos', 'OPTIONS')
  options.headers = { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization' }
  expect((await handler(options, context)).multiValueHeaders?.['access-control-allow-origin']).toEqual(['http://localhost:5173'])
})
