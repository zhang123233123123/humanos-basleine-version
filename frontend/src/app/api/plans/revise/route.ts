import { humanosErrorResponse, humanosRequest } from '@/lib/server/humanos-api'
import { getHumanOSUserId, unauthorizedResponse } from '@/lib/server/humanos-user'

export async function POST(req: Request) {
  const userId = await getHumanOSUserId()
  if (!userId) return unauthorizedResponse()
  try {
    const body = await req.json()
    const result = await humanosRequest('POST', '/api/plans/revise', { ...body, user_id: userId }) as { plan?: unknown }
    return Response.json({ data: { plan: result.plan || null }, resources: { self: '/api/plans/revise', tasks: '/api/tasks', execution_sessions: '/api/execution-sessions' }, meta: { resource: 'plan_revision', read_only: false } })
  } catch (error) {
    return humanosErrorResponse(error)
  }
}
