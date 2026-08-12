import { humanosErrorResponse, humanosRequest } from '@/lib/server/humanos-api'
import { getHumanOSUserId, unauthorizedResponse } from '@/lib/server/humanos-user'

export async function POST(req: Request) {
  const userId = await getHumanOSUserId()
  if (!userId) return unauthorizedResponse()
  try { return Response.json(await humanosRequest('POST', '/api/plans/replan', { ...await req.json(), user_id: userId }), { status: 202 }) }
  catch (error) { return humanosErrorResponse(error) }
}
