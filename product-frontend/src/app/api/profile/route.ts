import { humanosErrorResponse, humanosRequest } from '@/lib/server/humanos-api'
import { getHumanOSUserId, unauthorizedResponse } from '@/lib/server/humanos-user'

export async function GET() {
  try {
    const userId = await getHumanOSUserId()
    if (!userId) return unauthorizedResponse()
    const data = await humanosRequest('GET', `/api/profile?user_id=${encodeURIComponent(userId)}`)
    return Response.json(data)
  } catch (error) {
    return humanosErrorResponse(error)
  }
}

export async function PUT(req: Request) {
  try {
    const userId = await getHumanOSUserId()
    if (!userId) return unauthorizedResponse()
    const body = await req.json()
    const data = await humanosRequest('PUT', '/api/profile', { ...body, user_id: userId })
    return Response.json(data)
  } catch (error) {
    return humanosErrorResponse(error)
  }
}
