import { humanosErrorResponse, humanosRequest } from '@/lib/server/humanos-api'
import { getHumanOSUserId, unauthorizedResponse } from '@/lib/server/humanos-user'

export async function POST(req: Request) {
  const userId = await getHumanOSUserId()
  if (!userId) return unauthorizedResponse()
  try {
    const body = await req.json()
    const result = await humanosRequest('POST', '/api/execution-feedback', { ...body, user_id: userId }) as Record<string, unknown>
    return Response.json({
      data: result,
      resources: { self: '/api/execution-feedback', task: `/api/tasks?id=${encodeURIComponent(String(body.task_id || ''))}`, execution_sessions: '/api/execution-sessions' },
      meta: { resource: 'execution_feedback', aggregate_root: 'task', read_only: false },
    })
  } catch (error) {
    return humanosErrorResponse(error)
  }
}
