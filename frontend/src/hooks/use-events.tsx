import { create } from 'zustand'
import { EventInput } from '@fullcalendar/core'
import { toast } from 'sonner'

function draftDate(weekId: string, dayIndex: number, hour: number) {
  const date = new Date(`${weekId}T00:00:00`)
  date.setDate(date.getDate() + dayIndex)
  date.setMinutes(Math.round(hour * 60))
  return date.toISOString()
}

async function fetchDraftEvents(): Promise<EventInput[]> {
  const [planResponse, taskResponse] = await Promise.all([
    fetch('/api/plans/proposed', { cache: 'no-store' }),
    fetch('/api/tasks', { cache: 'no-store' }),
  ])
  if (!planResponse.ok) return []
  const planBody = await planResponse.json()
  const taskBody = taskResponse.ok ? await taskResponse.json() : {}
  const plan = planBody?.data?.plan
  if (!plan?.week_id || !Array.isArray(plan.plan_patch)) return []
  const titles = new Map<string, string>((taskBody?.data?.tasks || []).map((task: any) => [String(task.id), String(task.title || '')]))
  return plan.plan_patch.map((block: any, index: number) => ({
    id: `draft-${plan.plan_id}-${block.block_id || index}`,
    title: block.title || titles.get(String(block.task_id)) || (block.task_id ? String(block.task_id) : 'Draft session'),
    start: draftDate(String(plan.week_id), Number(block.day_index || 0), Number(block.start || 0)),
    end: draftDate(String(plan.week_id), Number(block.day_index || 0), Number(block.end || block.start || 0)),
    editable: false,
    classNames: ['humanos-draft-event'],
    extendedProps: {
      isDraft: true,
      status: 'draft',
      taskId: block.task_id,
      planId: plan.plan_id,
      planRevision: plan.plan_revision,
    },
  }))
}

type State = {
  events: EventInput[]
  currentStart: string
  currentEnd: string
  cachedRanges: { start: string; end: string }[]
}

type Actions = {
  setEvents: (events: EventInput[]) => void
  setCachedRanges: (cachedRanges: { start: string; end: string }[]) => void
  refetchEvents: (start?: string, end?: string) => Promise<void>
  isRangeCached: (start: string, end: string) => boolean
  setCurrentStart: (currentStart: string) => void
  setCurrentEnd: (currentEnd: string) => void
}

export const useEvents = create<State & Actions>((set, get) => ({
  events: [],
  cachedRanges: [],
  currentStart: '',
  currentEnd: '',
  setCurrentStart: (currentStart) => set({ currentStart }),
  setCurrentEnd: (currentEnd) => set({ currentEnd }),
  setEvents: (events) => set({ events }),
  setCachedRanges: (cachedRanges) => set({ cachedRanges }),
  refetchEvents: async (start?: string, end?: string) => {
    try {
      const { currentEnd, currentStart, cachedRanges } = get()

      const rangesToFetch =
        start && end
          ? [{ start, end }]
          : cachedRanges.length > 0
            ? cachedRanges
            : [{ start: currentStart, end: currentEnd }]

      let newEvents: EventInput[] = []

      for (const range of rangesToFetch) {
        const response = await fetch(
          `/api/calendar/events?start=${range.start}&end=${range.end}`,
        )

        if (!response.ok) {
          throw new Error('Failed to fetch events')
        }

        const data = await response.json()
        newEvents = [...newEvents, ...(data.data?.events || [])]
      }

      newEvents = [...newEvents, ...await fetchDraftEvents()]

      set((state) => {
        const overlapsFetchedRange = (event: EventInput) => {
          const eventStart = new Date(event.start as string | Date).getTime()
          const eventEnd = new Date((event.end || event.start) as string | Date).getTime()
          if (!Number.isFinite(eventStart) || !Number.isFinite(eventEnd)) return false
          return rangesToFetch.some((range) => {
            const rangeStart = Date.parse(range.start)
            const rangeEnd = Date.parse(range.end)
            return eventStart < rangeEnd && eventEnd > rangeStart
          })
        }

        const retained = state.events.filter((event) => !event.extendedProps?.isDraft && !overlapsFetchedRange(event))
        const byId = new Map<string, EventInput>()
        ;[...retained, ...newEvents].forEach((event) => {
          const key = String(event.id || `${event.title}-${event.start}`)
          byId.set(key, event)
        })
        return { events: Array.from(byId.values()) }
      })

      if (start && end) {
        set((state) => {
          const updatedRanges = [...state.cachedRanges]
          const newRange = { start, end }
          if (
            !updatedRanges.some(
              (range) => range.start === start && range.end === end,
            )
          ) {
            updatedRanges.push(newRange)
          }
          return { cachedRanges: updatedRanges }
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch events'
      toast(message)
      throw error
    }
  },
  isRangeCached: (start: string, end: string) => {
    return get().cachedRanges.some(
      (range) => range.start <= start && range.end >= end,
    )
  },
}))
