import { create } from 'zustand'
import { EventInput } from '@fullcalendar/core'
import { toast } from 'sonner'

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

        const retained = state.events.filter((event) => !overlapsFetchedRange(event))
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
