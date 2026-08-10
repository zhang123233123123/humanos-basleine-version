import { humanosErrorResponse, humanosRequest } from '@/lib/server/humanos-api'
import { getHumanOSUserId, unauthorizedResponse } from '@/lib/server/humanos-user'

export async function POST(req: Request) {
  const userId = await getHumanOSUserId()
  if (!userId) return unauthorizedResponse()
  try {
    const body = await req.json()
    const result = await humanosRequest('POST', '/api/plans/adjust-task', { ...body, user_id: userId }) as Record<string, unknown>
    const sessionResult = await humanosRequest('GET', `/api/execution-sessions?user_id=${encodeURIComponent(userId)}`) as { execution_sessions?: unknown[] }
    return Response.json({ data: { ...result, execution_sessions: sessionResult.execution_sessions || [] }, resources: { self: '/api/plans/adjust-task', tasks: '/api/tasks', execution_sessions: '/api/execution-sessions' }, meta: { resource: 'plan_revision', read_only: false } })
  } catch (error) {
    return humanosErrorResponse(error)
  }
}
