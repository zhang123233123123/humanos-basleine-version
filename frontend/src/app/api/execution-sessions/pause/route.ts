import { humanosErrorResponse, humanosRequest } from '@/lib/server/humanos-api'
import { getHumanOSUserId, unauthorizedResponse } from '@/lib/server/humanos-user'

export async function POST(req: Request) {
  const userId = await getHumanOSUserId()
  if (!userId) return unauthorizedResponse()
  try {
    const body = await req.json()
    const result = await humanosRequest('POST', '/api/execution-sessions/pause', { ...body, user_id: userId }) as { execution_session: unknown; pause_review: unknown }
    return Response.json({ data: { execution_session: result.execution_session, pause_review: result.pause_review }, resources: { self: '/api/execution-sessions/pause', tasks: '/api/tasks', current: '/api/execution-sessions/current' }, meta: { resource: 'execution_session', aggregate_root: 'task', read_only: false } })
  } catch (error) {
    return humanosErrorResponse(error)
  }
}
