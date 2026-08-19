import { humanosErrorResponse, humanosRequest } from '@/lib/server/humanos-api'
import { getHumanOSUserId, unauthorizedResponse } from '@/lib/server/humanos-user'

export async function GET(_req: Request, { params }: { params: { traitId: string } }) {
  const userId = await getHumanOSUserId()
  if (!userId) return unauthorizedResponse()
  if (!params.traitId) {
    return Response.json({ error: 'profile_trait_id_required', message: 'A trait id is required.' }, { status: 400 })
  }
  try {
    return Response.json(await humanosRequest(
      'GET',
      `/api/profile-traits/${encodeURIComponent(params.traitId)}/evidence?user_id=${encodeURIComponent(userId)}`,
    ))
  } catch (error) {
    return humanosErrorResponse(error)
  }
}
