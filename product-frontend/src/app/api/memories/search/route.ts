import { humanosErrorResponse, humanosRequest } from '@/lib/server/humanos-api'
import { getHumanOSUserId, unauthorizedResponse } from '@/lib/server/humanos-user'

export async function GET(req: Request) {
  const userId = await getHumanOSUserId()
  if (!userId) return unauthorizedResponse()
  try {
    const source = new URL(req.url).searchParams
    const query = new URLSearchParams({
      user_id: userId,
      q: source.get('q') || '',
      top_k: source.get('top_k') || '5',
    })
    return Response.json(await humanosRequest('GET', `/api/memories/search?${query}`))
  } catch (error) {
    return humanosErrorResponse(error)
  }
}

