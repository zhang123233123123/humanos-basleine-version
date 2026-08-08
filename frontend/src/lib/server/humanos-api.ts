import 'server-only'

const HUMANOS_BACKEND_URL = (
  process.env.HUMANOS_BACKEND_URL || 'http://localhost:8787'
).replace(/\/$/, '')

export class HumanOSApiError extends Error {
  status: number
  payload: unknown

  constructor(status: number, message: string, payload: unknown) {
    super(message)
    this.name = 'HumanOSApiError'
    this.status = status
    this.payload = payload
  }
}

function errorMessage(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return 'HumanOS backend error'
  const value = payload as { error?: unknown; message?: unknown }
  if (typeof value.message === 'string' && value.message) return value.message
  if (typeof value.error === 'string' && value.error) return value.error
  return 'HumanOS backend error'
}

export async function humanosRequest<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`${HUMANOS_BACKEND_URL}${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new HumanOSApiError(response.status, errorMessage(payload), payload)
  }
  return payload as T
}

export function humanosErrorResponse(error: unknown): Response {
  if (error instanceof HumanOSApiError) {
    return Response.json(
      { error: 'humanos_backend_error', message: error.message },
      { status: error.status },
    )
  }

  const message = error instanceof Error ? error.message : 'HumanOS backend unavailable'
  return Response.json(
    { error: 'humanos_backend_unavailable', message },
    { status: 502 },
  )
}
