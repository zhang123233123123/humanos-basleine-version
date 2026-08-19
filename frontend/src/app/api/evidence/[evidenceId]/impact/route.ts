import { humanosErrorResponse, humanosRequest } from '@/lib/server/humanos-api'
import { getHumanOSUserId, unauthorizedResponse } from '@/lib/server/humanos-user'

export async function GET(_req: Request, { params }: { params: { evidenceId: string } }) {
  const userId = await getHumanOSUserId()
  if (!userId) return unauthorizedResponse()
  if (!params.evidenceId) return Response.json({ error: 'evidence_id_required', message: 'An evidence id is required.' }, { status: 400 })
  try {
    return Response.json(await humanosRequest('GET', `/api/evidence/${encodeURIComponent(params.evidenceId)}/impact?user_id=${encodeURIComponent(userId)}`))
  } catch (error) {
    return humanosErrorResponse(error)
  }
}
