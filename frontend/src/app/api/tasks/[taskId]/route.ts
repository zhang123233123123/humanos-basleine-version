import { humanosErrorResponse, humanosRequest } from '@/lib/server/humanos-api'
import { getHumanOSUserId, unauthorizedResponse } from '@/lib/server/humanos-user'

export async function GET(_req: Request, { params }: { params: { taskId: string } }) {
  const userId = await getHumanOSUserId()
  if (!userId) return unauthorizedResponse()
  const taskId = String(params.taskId || '').trim()
  if (!taskId) return Response.json({ error: 'Task id is required' }, { status: 400 })

  try {
    const queryUser = encodeURIComponent(userId)
    const encodedTask = encodeURIComponent(taskId)
    const [taskResult, sessionResult, planResult, interruptionResult] = await Promise.all([
      humanosRequest('GET', `/api/tasks/${encodedTask}?user_id=${queryUser}`) as Promise<any>,
      humanosRequest('GET', `/api/execution-sessions?user_id=${queryUser}`) as Promise<any>,
      humanosRequest('GET', `/api/plans/active?user_id=${queryUser}`) as Promise<any>,
      humanosRequest('GET', `/api/interruption-episodes?user_id=${queryUser}`) as Promise<any>,
    ])
    const task = taskResult?.data?.task || taskResult?.task
    const sessions = (sessionResult?.execution_sessions || []).filter((item: any) => String(item?.task_id) === taskId)
    const currentStatuses = new Set(['ready', 'running', 'paused'])
    const plan = planResult?.plan || planResult?.data?.plan || null
    const planBlocks = (plan?.plan_patch || []).filter((item: any) => String(item?.task_id) === taskId)
    const interruptionData = interruptionResult?.data || interruptionResult || {}
    const episodes = (interruptionData?.episodes || []).filter((item: any) => String(item?.task_id) === taskId)

    return Response.json({
      data: {
        task,
        current_sessions: sessions.filter((item: any) => currentStatuses.has(String(item?.status))),
        history_sessions: sessions.filter((item: any) => !currentStatuses.has(String(item?.status))),
        interruption_episodes: episodes,
        plan_blocks: planBlocks,
        plan: plan ? { plan_id: plan.plan_id, plan_revision: plan.plan_revision, week_id: plan.week_id, plan_status: plan.plan_status } : null,
      },
      resources: { collection: '/api/tasks', execution_sessions: '/api/execution-sessions', active_plan: '/api/plans/active', interruptions: '/api/interruption-episodes' },
      meta: { resource: 'task_detail', aggregate_root: 'task', read_only: true },
    })
  } catch (error) {
    return humanosErrorResponse(error)
  }
}
