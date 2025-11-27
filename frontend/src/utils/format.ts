export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return 'Something went wrong'
}

export function formatDate(seconds: number): string {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(seconds * 1000))
}
