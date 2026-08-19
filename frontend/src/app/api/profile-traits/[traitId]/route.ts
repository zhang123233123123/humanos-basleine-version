import { humanosErrorResponse, humanosRequest } from '@/lib/server/humanos-api'
import { getHumanOSUserId, unauthorizedResponse } from '@/lib/server/humanos-user'

export async function PATCH(req: Request, { params }: { params: { traitId: string } }) {
  const userId = await getHumanOSUserId()
  if (!userId) return unauthorizedResponse()
  try {
    const body = await req.json()
    if (!params.traitId || !['edit', 'pause', 'resume', 'forget'].includes(body?.action)) {
      return Response.json({ error: 'invalid_profile_trait_action', message: 'A trait id and valid action are required.' }, { status: 400 })
    }
    if (body.action === 'edit' && !String(body.display_label || '').trim()) {
      return Response.json({ error: 'display_label_required', message: 'A display label is required.' }, { status: 400 })
    }
    return Response.json(await humanosRequest('PATCH', `/api/profile-traits/${encodeURIComponent(params.traitId)}`, { ...body, user_id: userId }))
  } catch (error) {
    return humanosErrorResponse(error)
  }
}
