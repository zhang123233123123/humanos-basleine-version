import { humanosErrorResponse, humanosRequest } from '@/lib/server/humanos-api'
import { getHumanOSUserId, unauthorizedResponse } from '@/lib/server/humanos-user'

export async function GET() {
  const userId = await getHumanOSUserId()
  if (!userId) return unauthorizedResponse()
  try {
    const current = await humanosRequest('GET', `/api/execution-sessions/current?user_id=${encodeURIComponent(userId)}`)
    return Response.json({
      data: { current },
      resources: { self: '/api/execution-sessions/current', tasks: '/api/tasks', current: '/api/execution-sessions/current' },
      meta: { resource: 'execution_session', aggregate_root: 'task', read_only: true },
    })
  } catch (error) {
    return humanosErrorResponse(error)
  }
}
