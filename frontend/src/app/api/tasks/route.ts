import { getServerSession } from 'next-auth'
import authOptions from '@/app/api/auth/[...nextauth]/authOptions'
import * as chrono from 'chrono-node'
import type { HumanOSTask, HumanOSMapEventInput } from '@/lib/contracts/task-contracts'

const HUMANOS_BACKEND = process.env.HUMANOS_BACKEND_URL || 'http://localhost:8787'

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

function normalizeStatus(value: unknown): HumanOSMapEventInput['extendedProps']['status'] {
  const raw = String(value || '').toLowerCase().trim()
  if (!raw) return 'pending'
  return (raw as HumanOSMapEventInput['extendedProps']['status']) || 'pending'
}

function normalizePriority(value: unknown): string {
  const raw = String(value || 'medium').toLowerCase().trim()
  if (['high', 'medium', 'low'].includes(raw)) return raw
  return 'medium'
}

function readContextWindow(task: HumanOSTask): Record<string, unknown> {
  return {
    ...(task.contextWindow || {}),
    ...(task.context_window || {}),
  } as Record<string, unknown>
}

function readTaskContextWindowText(task: HumanOSTask, key: string): string {
  const ctx = readContextWindow(task)
  const value = ctx[key]
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  return ''
}

function estimateMinutes(task: HumanOSTask): number {
  if (asNumber(task.duration) > 0) return asNumber(task.duration)
  const execution = task.execution || {}
  const candidate = asNumber(
    execution.original_estimate_minutes || execution.remaining_duration_minutes || execution.accumulated_actual_minutes,
  )
  return Math.max(candidate, 60)
}

function buildWindowDefault(task: HumanOSTask): Date {
  const now = new Date()
  const timezoneHourOffset = /(\+|-)\d{2}:?\d{2}/.test(task.timezone || '')
  if (timezoneHourOffset) return now
  now.setHours(9, 0, 0, 0)
  return now
}

function mapTaskToEvent(task: HumanOSTask): HumanOSMapEventInput {
  const contextWindow = readContextWindow(task)
  const candidateStart =
    toISOString(task.start_at) ||
    toISOString(contextWindow.startAt) ||
    toISOString(contextWindow.start_at) ||
    toISOString(task.start_time) ||
    toISOString(task.start) ||
    parseDateField(task.due)?.toISOString() ||
    null
  let start = parseDateField(String(task.due || '') )?.toISOString() || candidateStart
  let end =
    toISOString(task.deadline_at) ||
    toISOString(contextWindow.deadlineAt) ||
    toISOString(contextWindow.deadline_at) ||
    toISOString(task.deadline) ||
    toISOString(task.end_time) ||
    toISOString(task.end) ||
    null

  if (!start) {
    const byText = parseDateField(task.context || '') || parseDateField(task.title)
    if (byText) start = byText.toISOString()
  }

  if (!start) {
    const fallback = buildWindowDefault(task)
    start = fallback.toISOString()
  }

  if (!end) {
    const minutes = estimateMinutes(task)
    const parsed = new Date(start)
    parsed.setMinutes(parsed.getMinutes() + Math.max(minutes, 1))
    end = parsed.toISOString()
  }

  const progress = readTaskContextWindowText(task, 'progress')
  const nextStep =
    readTaskContextWindowText(task, 'nextStep') ||
    readTaskContextWindowText(task, 'next_step')
  const openQuestions =
    readTaskContextWindowText(task, 'openQuestions') ||
    readTaskContextWindowText(task, 'open_questions')

  const safeId = String(task.id || `tmp-${Date.now()}`)

  return {
    id: safeId,
    title: task.title || 'Untitled',
    start,
    end,
    allDay: Boolean(task.all_day) || false,
    extendedProps: {
      description: task.context || '',
      status: normalizeStatus(task.status),
      priority: normalizePriority(task.priority),
      attendees: task.attendees || [],
      context: task.context || '',
      progress,
      nextStep,
      openQuestions,
      execution: task.execution || {},
      taskType: String(task.task_type || ''),
    },
  }
}

function filterInRange(
  event: HumanOSMapEventInput,
  rangeStart?: string,
  rangeEnd?: string,
): boolean {
  if (!rangeStart || !rangeEnd) return true
  const start = Date.parse(event.start || '')
  const end = Date.parse(event.end || event.start)
  const left = Date.parse(rangeStart)
  const right = Date.parse(rangeEnd)
  if (Number.isNaN(start) || Number.isNaN(end) || Number.isNaN(left) || Number.isNaN(right)) {
    return true
  }
  return start < right && end > left
}

function normalizePayloadForBackend(body: any): Record<string, unknown> {
  const normalized = { ...body } as Record<string, unknown>

  if (body.start !== undefined && body.start_at === undefined) normalized.start_at = toISOString(body.start)
  if (body.end !== undefined && body.deadline_at === undefined) normalized.deadline_at = toISOString(body.end)
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
    const dueStart = toISOString(body.due)
    if (!normalized.start_at && dueStart) normalized.start_at = dueStart
  }

  return normalized
}

async function proxyRequest(method: string, path: string, body?: Record<string, unknown>) {
  const response = await fetch(`${HUMANOS_BACKEND}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message =
      (typeof data?.error === 'string' && data.error) ||
      (typeof data?.message === 'string' && data.message) ||
      'HumanOS backend error'
    throw new Error(message)
  }
  return data
}

function withUserQuery(url: string, userEmail: string | undefined): string {
  const target = new URL(url, `http://localhost`)
  if (userEmail) target.searchParams.set('user_id', userEmail)
  return target.pathname + target.search
}

function isPreviewTask(task: HumanOSTask) {
  return Boolean(task.is_preview || task.id?.startsWith('preview-'))
}

function parseTaskArrayFromBackend(raw: unknown): HumanOSTask[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw as HumanOSTask[]
  if (Array.isArray((raw as { tasks?: unknown[] })?.tasks)) return (raw as { tasks?: HumanOSTask[] }).tasks || []
  return []
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return Response.json({ events: [] })
  }

  const { searchParams } = new URL(req.url)
  const start = searchParams.get('start')
  const end = searchParams.get('end')

  try {
    const query = withUserQuery('/api/tasks', session.user.email)
    const taskData = await proxyRequest('GET', query)
    const tasks = parseTaskArrayFromBackend(taskData).filter((task) => !isPreviewTask(task))
    const events = tasks
      .map((task) => mapTaskToEvent(task))
      .filter((event) => filterInRange(event, start || undefined, end || undefined))
    return Response.json({ events })
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const normalized = normalizePayloadForBackend({
      ...body,
      user_id: session.user.email,
      status: body?.status || 'queued',
    })
    const data = await proxyRequest('POST', '/api/tasks', normalized)
    const payload = data.task || data
    if (data.task) {
      return Response.json({ task: payload })
    }
    return Response.json(data)
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const taskId = String(body?.id || body?.task_id || '').trim()
    if (!taskId) {
      return Response.json({ error: 'Task id is required' }, { status: 400 })
    }

    const normalized = normalizePayloadForBackend({
      ...body,
      user_id: session.user.email,
    })
    delete (normalized as { id?: unknown }).id
    const data = await proxyRequest('PATCH', `/api/tasks/${taskId}`, normalized)
    const payload = data.task || data
    return Response.json({ task: payload })
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  return PUT(req)
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const taskId = String(body?.id || body?.task_id || '').trim()
    if (!taskId) {
      return Response.json({ error: 'Task id is required' }, { status: 400 })
    }

    const data = await proxyRequest('DELETE', `/api/tasks/${taskId}?user_id=${encodeURIComponent(session.user.email)}`)
    return Response.json(data)
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 })
  }
}
