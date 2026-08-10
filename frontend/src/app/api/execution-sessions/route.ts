import { humanosErrorResponse, humanosRequest } from '@/lib/server/humanos-api'
import { getHumanOSUserId, unauthorizedResponse } from '@/lib/server/humanos-user'

export async function GET(req: Request) {
  const userId = await getHumanOSUserId()
  if (!userId) return unauthorizedResponse()
  try {
    const status = new URL(req.url).searchParams.get('status')
    const query = new URLSearchParams({ user_id: userId })
    if (status) query.set('status', status)
    const result = await humanosRequest('GET', `/api/execution-sessions?${query}`) as { execution_sessions?: unknown[] }
    return Response.json({
      data: { execution_sessions: result.execution_sessions || [] },
      resources: { self: '/api/execution-sessions', tasks: '/api/tasks', current: '/api/execution-sessions/current' },
      meta: { resource: 'execution_sessions', aggregate_root: 'task', read_only: true },
    })
  } catch (error) {
    return humanosErrorResponse(error)
  }
}
