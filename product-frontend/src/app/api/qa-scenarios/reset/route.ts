import { humanosErrorResponse, humanosRequest } from '@/lib/server/humanos-api'
import { getHumanOSUserId, unauthorizedResponse } from '@/lib/server/humanos-user'

export async function POST() {
  const userId = await getHumanOSUserId()
  if (!userId) return unauthorizedResponse()
  try {
    return Response.json(await humanosRequest('POST', '/api/qa-scenarios/reset', {}))
  } catch (error) {
    return humanosErrorResponse(error)
  }
}
