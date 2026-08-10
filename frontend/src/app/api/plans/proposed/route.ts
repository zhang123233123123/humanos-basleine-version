import { humanosErrorResponse, humanosRequest } from '@/lib/server/humanos-api'
import { getHumanOSUserId, unauthorizedResponse } from '@/lib/server/humanos-user'

export async function GET(req: Request) {
  const userId = await getHumanOSUserId()
  if (!userId) return unauthorizedResponse()
  try {
    const weekId = new URL(req.url).searchParams.get('week_id')
    const query = new URLSearchParams({ user_id: userId })
    if (weekId) query.set('week_id', weekId)
    const result = await humanosRequest('GET', `/api/plans/proposed?${query}`) as { plan?: unknown }
    return Response.json({ data: { plan: result.plan || null }, resources: { self: '/api/plans/proposed', tasks: '/api/tasks', execution_sessions: '/api/execution-sessions' }, meta: { resource: 'plan_revision', read_only: true } })
  } catch (error) {
    return humanosErrorResponse(error)
  }
}
