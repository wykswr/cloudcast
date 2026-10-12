type Level = 'info' | 'warn' | 'error'
type Fields = Record<string, unknown>

function serializeError(error: unknown): unknown {
  if (!(error instanceof Error)) return error
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    ...(error.cause === undefined ? {} : { cause: serializeError(error.cause) }),
  }
}

// One JSON object per line. Lambda's JSON log format (template.yaml) nests it under
// `message`, so CloudWatch Logs Insights can filter on these fields directly.
function write(level: Level, message: string, fields: Fields = {}) {
  const entry: Fields = { level, message, ...fields }
  if ('error' in fields) entry.error = serializeError(fields.error)
  console[level](JSON.stringify(entry))
}

export const logger = {
  info: (message: string, fields?: Fields) => write('info', message, fields),
  warn: (message: string, fields?: Fields) => write('warn', message, fields),
  error: (message: string, fields?: Fields) => write('error', message, fields),
}
