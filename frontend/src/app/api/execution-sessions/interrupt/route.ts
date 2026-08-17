import { humanosErrorResponse, humanosRequest } from '@/lib/server/humanos-api'
import { getHumanOSUserId, unauthorizedResponse } from '@/lib/server/humanos-user'

export async function POST(req: Request) {
  const userId = await getHumanOSUserId()
  if (!userId) return unauthorizedResponse()
  try {
    const body = await req.json()
    if (!body.execution_session_id) {
      return Response.json({ error: { code: 'validation_error', message: 'execution_session_id is required' } }, { status: 400 })
    }
    const result = await humanosRequest('POST', '/api/execution-sessions/interrupt', { ...body, user_id: userId }) as {
      execution_session: unknown
      context_dump?: unknown
      interruption: unknown
      pause_review: unknown
      ready_queue?: unknown[]
      calendar_diff?: unknown
      proposed_plan?: unknown
      validation?: unknown
      planning_warning?: string
    }
    return Response.json({
      data: {
        execution_session: result.execution_session,
        context_dump: result.context_dump || null,
        interruption: result.interruption,
        pause_review: result.pause_review,
        ready_queue: result.ready_queue || [],
        calendar_diff: result.calendar_diff || null,
        proposed_plan: result.proposed_plan || null,
        validation: result.validation || null,
        planning_warning: result.planning_warning || null,
      },
      resources: { self: '/api/execution-sessions/interrupt', tasks: '/api/tasks', current: '/api/execution-sessions/current' },
      meta: { resource: 'execution_interruption', aggregate_root: 'task', read_only: false },
    })
  } catch (error) {
    return humanosErrorResponse(error)
  }
}
