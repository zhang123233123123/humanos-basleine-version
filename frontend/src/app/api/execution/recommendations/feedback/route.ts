import { humanosErrorResponse, humanosRequest } from '@/lib/server/humanos-api'
import { getHumanOSUserId, unauthorizedResponse } from '@/lib/server/humanos-user'

export async function POST(req: Request) {
  const userId = await getHumanOSUserId()
  if (!userId) return unauthorizedResponse()
  try {
    const body = await req.json()
    const result = await humanosRequest('POST', '/api/execution/recommendations/feedback', { ...body, user_id: userId }) as { data: unknown }
    return Response.json(result)
  } catch (error) {
    return humanosErrorResponse(error)
  }
}
