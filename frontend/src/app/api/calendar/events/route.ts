import type { HumanOSTask } from '@/lib/contracts/task-contracts'
import { projectCalendarEvents } from '@/lib/server/calendar-event-projection'
import { humanosErrorResponse, humanosRequest } from '@/lib/server/humanos-api'
import { getHumanOSUserId, unauthorizedResponse } from '@/lib/server/humanos-user'

export async function GET(req: Request) {
  const userId = await getHumanOSUserId()
  if (!userId) return unauthorizedResponse()
  const { searchParams } = new URL(req.url)
  try {
    const [taskEnvelope, executionData] = await Promise.all([
      humanosRequest('GET', `/api/tasks?user_id=${encodeURIComponent(userId)}`),
      humanosRequest('GET', `/api/execution-sessions?user_id=${encodeURIComponent(userId)}`),
    ]) as [any, any]
    const tasks = (taskEnvelope?.data?.tasks || []) as HumanOSTask[]
    const sessions = Array.isArray(executionData?.execution_sessions) ? executionData.execution_sessions : []
    return Response.json({
      data: { events: projectCalendarEvents(tasks, sessions, searchParams.get('start'), searchParams.get('end')) },
      resources: { tasks: '/api/tasks?view=resource', execution_sessions: '/api/execution-sessions' },
      meta: { resource: 'calendar_events', read_only: true },
    })
  } catch (error) {
    return humanosErrorResponse(error)
  }
}
