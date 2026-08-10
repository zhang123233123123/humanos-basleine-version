import { humanosErrorResponse, humanosRequest } from '@/lib/server/humanos-api'
import { getHumanOSUserId, unauthorizedResponse } from '@/lib/server/humanos-user'

export async function POST(req: Request) {
  const userId = await getHumanOSUserId()
  if (!userId) return unauthorizedResponse()
  try {
    const body = await req.json()
    const result = await humanosRequest('POST', '/api/state-checkins', { ...body, user_id: userId }) as Record<string, unknown>
    return Response.json({ data: result, resources: { self: '/api/state-checkins', profile: '/api/profile', active_plan: '/api/plans/active', execution_sessions: '/api/execution-sessions' }, meta: { resource: 'daily_checkin', aggregate_root: 'profile', read_only: false } })
  } catch (error) {
    return humanosErrorResponse(error)
  }
}
