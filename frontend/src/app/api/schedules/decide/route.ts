import { humanosErrorResponse, humanosRequest } from '@/lib/server/humanos-api'
import { getHumanOSUserId, unauthorizedResponse } from '@/lib/server/humanos-user'

export async function POST(req: Request) {
  const userId = await getHumanOSUserId()
  if (!userId) return unauthorizedResponse()
  try {
    const body = await req.json()
    return Response.json(await humanosRequest('POST', '/api/background-jobs', { user_id: userId, kind: 'schedule_plan', payload: body }), { status: 202 })
  } catch (error) {
    return humanosErrorResponse(error)
  }
}
