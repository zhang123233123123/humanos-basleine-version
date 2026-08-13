import { humanosErrorResponse, humanosRequest } from '@/lib/server/humanos-api'
import { getHumanOSUserId, unauthorizedResponse } from '@/lib/server/humanos-user'

export async function POST(req: Request) {
  const userId = await getHumanOSUserId()
  if (!userId) return unauthorizedResponse()
  try {
    const body = await req.json()
    const result = await humanosRequest('POST', '/api/execution-sessions/recommend-action', { ...body, user_id: userId })
    return Response.json({ data: result })
  } catch (error) {
    return humanosErrorResponse(error)
  }
}
