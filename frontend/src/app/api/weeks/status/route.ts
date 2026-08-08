import { humanosErrorResponse, humanosRequest } from '@/lib/server/humanos-api'
import { getHumanOSUserId, unauthorizedResponse } from '@/lib/server/humanos-user'

export async function GET(req: Request) {
  const userId = await getHumanOSUserId()
  if (!userId) return unauthorizedResponse()
  try {
    const weekId = new URL(req.url).searchParams.get('week_id')
    const query = new URLSearchParams({ user_id: userId })
    if (weekId) query.set('week_id', weekId)
    return Response.json(await humanosRequest('GET', `/api/weeks/status?${query}`))
  } catch (error) {
    return humanosErrorResponse(error)
  }
}

