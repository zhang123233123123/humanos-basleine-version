import { humanosErrorResponse, humanosRequest } from '@/lib/server/humanos-api'
import { getHumanOSUserId, unauthorizedResponse } from '@/lib/server/humanos-user'

export async function GET() {
  const userId = await getHumanOSUserId()
  if (!userId) return unauthorizedResponse()
  try {
    return Response.json(await humanosRequest('GET', `/api/test-clock?user_id=${encodeURIComponent(userId)}`))
  } catch (error) {
    return humanosErrorResponse(error)
  }
}

export async function POST(req: Request) {
  const userId = await getHumanOSUserId()
  if (!userId) return unauthorizedResponse()
  try {
    const body = await req.json()
    return Response.json(await humanosRequest('POST', '/api/test-clock', { ...body, user_id: userId }))
  } catch (error) {
    return humanosErrorResponse(error)
  }
}
