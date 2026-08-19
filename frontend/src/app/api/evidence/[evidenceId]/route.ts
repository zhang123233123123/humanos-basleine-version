import { humanosErrorResponse, humanosRequest } from '@/lib/server/humanos-api'
import { getHumanOSUserId, unauthorizedResponse } from '@/lib/server/humanos-user'

export async function DELETE(req: Request, { params }: { params: { evidenceId: string } }) {
  const userId = await getHumanOSUserId()
  if (!userId) return unauthorizedResponse()
  try {
    const body = await req.json()
    if (!params.evidenceId || body?.user_confirmed !== true || !String(body?.request_id || '').trim()) {
      return Response.json({ error: 'invalid_evidence_deletion', message: 'Evidence id, explicit confirmation, and request id are required.' }, { status: 400 })
    }
    return Response.json(await humanosRequest('DELETE', `/api/evidence/${encodeURIComponent(params.evidenceId)}`, { ...body, user_id: userId }))
  } catch (error) {
    return humanosErrorResponse(error)
  }
}
