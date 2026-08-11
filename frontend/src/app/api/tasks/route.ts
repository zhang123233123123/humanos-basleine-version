import * as chrono from 'chrono-node'
import type { HumanOSTask } from '@/lib/contracts/task-contracts'
import { humanosErrorResponse, humanosRequest } from '@/lib/server/humanos-api'
import { getHumanOSUserId, unauthorizedResponse } from '@/lib/server/humanos-user'

function parseDateField(text: string | null | undefined): Date | null {
  if (!text) return null
  const results = chrono.parse(text, new Date(), { forwardDate: true })
  if (results.length > 0 && results[0].start) {
    return results[0].start.date()
  }
  return null
}

function toISOString(v: any): string | null {
  if (!v) return null
  if (typeof v === 'number') {
    const d = new Date(v > 9999999999 ? v : v * 1000)
    return isNaN(d.getTime()) ? null : d.toISOString()
  }
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

function asNumber(input: unknown, fallback = 0): number {
  const value = Number(input)
  return Number.isFinite(value) ? value : fallback
}

function readContextWindow(task: HumanOSTask): Record<string, unknown> {
  return {
    ...(task.contextWindow || {}),
    ...(task.context_window || {}),
  } as Record<string, unknown>
}

function normalizePayloadForBackend(body: any): Record<string, unknown> {
  const normalized = { ...body } as Record<string, unknown>
  if (body.createRequestId && !body.create_request_id) normalized.create_request_id = body.createRequestId

  if (body.start !== undefined && body.start_at === undefined) normalized.start_at = toISOString(body.start)
  if (body.start && body.end) {
    const start = new Date(body.start).getTime()
    const end = new Date(body.end).getTime()
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      normalized.duration = Math.max(Math.round((end - start) / 60000), 1)
      normalized.estimated_duration = normalized.duration
    }
  }
  if (body.summary !== undefined && !normalized.title) normalized.title = body.summary

  const contextWindow = {
    ...readContextWindow(body as HumanOSTask),
  }
  if (typeof body.progress === 'string' && body.progress.trim()) contextWindow.progress = body.progress
  if (typeof body.nextStep === 'string' && body.nextStep.trim()) contextWindow.nextStep = body.nextStep
  if (typeof body.openQuestions === 'string' && body.openQuestions.trim())
    contextWindow.open_questions = body.openQuestions
  if (Object.keys(contextWindow).length > 0) normalized.context_window = contextWindow
  if (typeof body.context === 'string' && body.context.trim()) normalized.context = body.context

  if (body.estimated_duration != null && body.duration == null) normalized.duration = asNumber(body.estimated_duration)
  if (body.duration != null && body.estimated_duration == null) normalized.estimated_duration = asNumber(body.duration)

  if (body.due) {
    const deadline = toISOString(body.due) || parseDateField(String(body.due))?.toISOString()
    if (!normalized.deadline_at && deadline) normalized.deadline_at = deadline
  }

  return normalized
}

function withUserQuery(url: string, userEmail: string | undefined): string {
  const target = new URL(url, `http://localhost`)
  if (userEmail) target.searchParams.set('user_id', userEmail)
  return target.pathname + target.search
}

export async function GET() {
  const userId = await getHumanOSUserId()
  if (!userId) return unauthorizedResponse()
  try {
    const query = withUserQuery('/api/tasks', userId)
    return Response.json(await humanosRequest('GET', query))
  } catch (error) {
    return humanosErrorResponse(error)
  }
}

export async function POST(req: Request) {
  const userId = await getHumanOSUserId()
  if (!userId) return unauthorizedResponse()

  try {
    const body = await req.json().catch(() => ({}))
    const normalized = normalizePayloadForBackend({
      ...body,
      user_id: userId,
      status: body?.status || 'queued',
    })
    return Response.json(await humanosRequest('POST', '/api/tasks', normalized))
  } catch (error) {
    return humanosErrorResponse(error)
  }
}

export async function PUT(req: Request) {
  const userId = await getHumanOSUserId()
  if (!userId) return unauthorizedResponse()

  try {
    const body = await req.json().catch(() => ({}))
    const taskId = String(body?.id || body?.task_id || '').trim()
    if (!taskId) {
      return Response.json({ error: 'Task id is required' }, { status: 400 })
    }

    const normalized = normalizePayloadForBackend({
      ...body,
      user_id: userId,
    })
    delete (normalized as { id?: unknown }).id
    return Response.json(await humanosRequest('PATCH', `/api/tasks/${taskId}`, normalized))
  } catch (error) {
    return humanosErrorResponse(error)
  }
}

export async function PATCH(req: Request) {
  return PUT(req)
}

export async function DELETE(req: Request) {
  const userId = await getHumanOSUserId()
  if (!userId) return unauthorizedResponse()

  try {
    const body = await req.json().catch(() => ({}))
    const taskId = String(body?.id || body?.task_id || '').trim()
    if (!taskId) {
      return Response.json({ error: 'Task id is required' }, { status: 400 })
    }

    const data = await humanosRequest('DELETE', `/api/tasks/${taskId}?user_id=${encodeURIComponent(userId)}`)
    return Response.json(data)
  } catch (error) {
    return humanosErrorResponse(error)
  }
}
