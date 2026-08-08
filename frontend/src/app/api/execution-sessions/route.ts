import { humanosErrorResponse, humanosRequest } from '@/lib/server/humanos-api'
import { getHumanOSUserId, unauthorizedResponse } from '@/lib/server/humanos-user'

export async function GET(req: Request) {
  const userId = await getHumanOSUserId()
  if (!userId) return unauthorizedResponse()
  try {
    const status = new URL(req.url).searchParams.get('status')
    const query = new URLSearchParams({ user_id: userId })
    if (status) query.set('status', status)
    return Response.json(await humanosRequest('GET', `/api/execution-sessions?${query}`))
  } catch (error) {
    return humanosErrorResponse(error)
  }
}

