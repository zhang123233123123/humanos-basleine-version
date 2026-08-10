import { humanosErrorResponse, humanosRequest } from '@/lib/server/humanos-api'
import { getHumanOSUserId, unauthorizedResponse } from '@/lib/server/humanos-user'

export async function POST(req: Request) {
  const userId = await getHumanOSUserId()
  if (!userId) return unauthorizedResponse()
  try {
    const body = await req.json()
    const result = await humanosRequest('POST', '/api/execution-sessions/impact', { ...body, user_id: userId }) as { impact: unknown }
    return Response.json({ data: { impact: result.impact }, resources: { self: '/api/execution-sessions/impact', tasks: '/api/tasks', current: '/api/execution-sessions/current' }, meta: { resource: 'execution_impact', aggregate_root: 'task', read_only: true } })
  } catch (error) {
    return humanosErrorResponse(error)
  }
}
