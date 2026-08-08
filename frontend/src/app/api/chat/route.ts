import { getServerSession } from 'next-auth'
import authOptions from '@/app/api/auth/[...nextauth]/authOptions'
import * as chrono from 'chrono-node'

const HUMANOS_BACKEND = process.env.HUMANOS_BACKEND_URL || 'http://localhost:8787'

function parseDateField(text: string | null | undefined): string | null {
  if (!text) return null
  const results = chrono.parse(text, new Date(), { forwardDate: true })
  if (results.length > 0 && results[0].start) {
    return results[0].start.date().toISOString()
  }
  return null
}

function toISOString(v: any): string | null {
  if (!v) return null
  // Unix timestamp (number)
  if (typeof v === 'number') {
    const d = new Date(v > 9999999999 ? v : v * 1000)
    return isNaN(d.getTime()) ? null : d.toISOString()
  }
  // ISO string or other date string
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

function enrichTaskDates(task: any): any {
  // Try structured datetime fields first
  let start = toISOString(task.start_time) || toISOString(task.start_at) || toISOString(task.start) || null
  let end = toISOString(task.end_time) || toISOString(task.deadline_at) || toISOString(task.end) || null

  // Try parsing natural language from text fields
  if (!start) {
    start = parseDateField(task.due) || parseDateField(task.deadline) || parseDateField(task.title)
  }
  if (!end) {
    end = parseDateField(task.deadline) || parseDateField(task.due)
  }
  // If we have start but no end, default to start + 1 hour
  if (start && !end) {
    const startDate = new Date(start)
    end = new Date(startDate.getTime() + 3600000).toISOString()
  }

  return { ...task, start_time: start, end_time: end }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)

    if (!session || !session.user?.email) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const body = await req.json()
    const { message, thread_id } = body

    if (!message) {
      return Response.json({ error: 'message is required' }, { status: 400 })
    }

    const res = await fetch(`${HUMANOS_BACKEND}/api/chat/turn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: session.user.email,
        text: message,
        thread_id: thread_id || undefined,
        current_time: new Date().toISOString(),
      }),
    })

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      return Response.json(
        { error: errData.message || 'HumanOS backend error' },
        { status: 500 },
      )
    }

    const data = await res.json()

    // Enrich task dates using chrono-node before returning to client
    if (data.turn?.tasks && Array.isArray(data.turn.tasks)) {
      data.turn.tasks = data.turn.tasks.map(enrichTaskDates)
    }

    return Response.json(data)
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 })
  }
}
