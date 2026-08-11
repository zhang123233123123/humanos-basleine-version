import 'server-only'

import { getServerSession } from 'next-auth'
import authOptions from '@/app/api/auth/[...nextauth]/authOptions'

export async function getHumanOSUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions)
  return session?.user?.id?.trim() || null
}

export function unauthorizedResponse(): Response {
  return Response.json(
    { error: 'not_authenticated', message: 'Not authenticated' },
    { status: 401 },
  )
}
