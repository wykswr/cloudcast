import type { ContentfulStatusCode } from 'hono/utils/http-status'

export class ApiError extends Error {
  constructor(public readonly status: ContentfulStatusCode, public readonly detail: string, options?: ErrorOptions) {
    super(detail, options)
  }
}

export async function awsOperation<T>(detail: string, operation: () => Promise<T>, includeMessage = true): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof ApiError) throw error
    console.error(detail, error)
    const suffix = includeMessage ? `: ${error instanceof Error ? error.message : 'Unknown error'}` : ''
    throw new ApiError(502, detail + suffix, { cause: error })
  }
}
