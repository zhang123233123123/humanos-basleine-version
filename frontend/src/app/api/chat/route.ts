import { humanosErrorResponse, humanosRequest } from '@/lib/server/humanos-api'
import { getHumanOSUserId, unauthorizedResponse } from '@/lib/server/humanos-user'

export async function POST(req: Request) {
  try {
    const userId = await getHumanOSUserId()
    if (!userId) return unauthorizedResponse()

    const body = await req.json()
    const { message, thread_id, assistant_mode, locale } = body

    if (!message) {
      return Response.json({ error: 'message is required' }, { status: 400 })
    }

    const data: any = await humanosRequest('POST', '/api/background-jobs', {
      user_id: userId, kind: 'chat_parse', payload: {
        text: message, thread_id: thread_id || undefined,
        assistant_mode: assistant_mode || 'task_planner', locale: locale || 'zh',
        current_time: new Date().toISOString(),
      },
    })
    return Response.json(data, { status: 202 })
  } catch (error) {
    return humanosErrorResponse(error)
  }
}
