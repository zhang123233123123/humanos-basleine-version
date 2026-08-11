import { humanosErrorResponse, humanosRequest } from '@/lib/server/humanos-api'
import { getHumanOSUserId, unauthorizedResponse } from '@/lib/server/humanos-user'

export async function POST(req: Request) {
  const userId = await getHumanOSUserId()
  if (!userId) return unauthorizedResponse()
  try {
    const body = await req.json()
    return Response.json(await humanosRequest('POST', '/api/background-jobs', { ...body, user_id: userId }), { status: 202 })
  } catch (error) { return humanosErrorResponse(error) }
}

export async function GET(req: Request) {
  const userId = await getHumanOSUserId()
  if (!userId) return unauthorizedResponse()
  try {
    const jobId = new URL(req.url).searchParams.get('job_id') || ''
    return Response.json(await humanosRequest('GET', `/api/background-jobs?user_id=${encodeURIComponent(userId)}&job_id=${encodeURIComponent(jobId)}`))
  } catch (error) { return humanosErrorResponse(error) }
}
