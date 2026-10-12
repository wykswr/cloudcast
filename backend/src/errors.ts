import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { logger } from './logger'

export class ApiError extends Error {
  constructor(
    public readonly status: ContentfulStatusCode,
    public readonly detail: string,
    options?: ErrorOptions,
  ) {
    super(detail, options)
  }
}

export async function awsOperation<T>(
  detail: string,
  operation: () => Promise<T>,
  includeMessage = true,
): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof ApiError) throw error
    logger.error(detail, { error })
    const reason = error instanceof Error ? error.message : 'Unknown error'
    const suffix = includeMessage ? `: ${reason}` : ''
    throw new ApiError(502, detail + suffix, { cause: error })
  }
}
