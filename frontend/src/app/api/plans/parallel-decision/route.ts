import { humanosErrorResponse, humanosRequest } from '@/lib/server/humanos-api'
import { getHumanOSUserId, unauthorizedResponse } from '@/lib/server/humanos-user'

export async function POST(req: Request) {
  const userId = await getHumanOSUserId()
  if (!userId) return unauthorizedResponse()
  try {
    const body = await req.json() as Record<string, unknown>
    const planId = typeof body.plan_id === 'string' ? body.plan_id.trim() : ''
    const suggestionId = typeof body.suggestion_id === 'string' ? body.suggestion_id.trim() : ''
    const action = body.action
    if (!planId || !suggestionId) {
      return Response.json(
        { error: 'invalid_request', message: 'plan_id and suggestion_id are required' },
        { status: 400 },
      )
    }
    if (action !== 'combine' && action !== 'keep_separate') {
      return Response.json(
        { error: 'invalid_request', message: 'action must be one of: combine, keep_separate' },
        { status: 400 },
      )
    }
    const result = await humanosRequest('POST', '/api/plans/parallel-decision', {
      ...body,
      plan_id: planId,
      suggestion_id: suggestionId,
      action,
      user_id: userId,
    }) as { plan?: unknown }
    return Response.json({ data: { plan: result.plan || null } })
  } catch (error) {
    return humanosErrorResponse(error)
  }
}
