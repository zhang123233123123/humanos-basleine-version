import { humanosErrorResponse, humanosRequest } from '@/lib/server/humanos-api'
import { getHumanOSUserId, unauthorizedResponse } from '@/lib/server/humanos-user'

export async function GET() {
  const userId = await getHumanOSUserId()
  if (!userId) return unauthorizedResponse()
  try {
    return Response.json(await humanosRequest('GET', `/api/profile-traits?user_id=${encodeURIComponent(userId)}`))
  } catch (error) {
    return humanosErrorResponse(error)
  }
}
