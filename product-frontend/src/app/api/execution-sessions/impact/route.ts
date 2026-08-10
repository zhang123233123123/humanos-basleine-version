import { humanosErrorResponse, humanosRequest } from '@/lib/server/humanos-api'
import { getHumanOSUserId, unauthorizedResponse } from '@/lib/server/humanos-user'

export async function POST(req: Request) {
  const userId = await getHumanOSUserId()
  if (!userId) return unauthorizedResponse()
  try {
    const body = await req.json()
    const result = await humanosRequest<any>('POST', '/api/execution-sessions/impact', { ...body, user_id: userId })
    const impact = result?.impact || result?.evaluation || result || {}
    const remaining = Math.max(Number(body.remaining_minutes || 0), 0)
    const estimatedEnd = new Date(Date.now() + remaining * 60_000).toISOString()
    return Response.json({
      impact: {
        ...impact,
        requires_plan_adjustment: Boolean(impact.requires_adjustment),
        estimated_end_at: impact.estimated_end_at || estimatedEnd,
        affected_sessions: Array.isArray(impact.affected_sessions)
          ? impact.affected_sessions
          : (impact.affected_task_ids || []).map((taskId: string) => ({
              execution_session_id: `affected-${taskId}`,
              task_id: taskId,
              overlap_minutes: 0,
            })),
      },
    })
  } catch (error) {
    return humanosErrorResponse(error)
  }
}
