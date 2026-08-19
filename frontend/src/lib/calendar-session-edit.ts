export type CalendarPlanBlock = Record<string, unknown> & {
  block_id?: string
  task_id?: string
}

export function findCalendarBlock(
  planPatch: CalendarPlanBlock[],
  blockId: string,
): CalendarPlanBlock | undefined {
  return planPatch.find((block) => String(block.block_id || '') === blockId)
}

export function moveCalendarBlock(
  planPatch: CalendarPlanBlock[],
  blockId: string,
  start: Date,
  end: Date,
): CalendarPlanBlock[] {
  const dayIndex = (start.getDay() + 6) % 7
  return planPatch.map((block) => String(block.block_id || '') !== blockId ? block : {
    ...block,
    day_index: dayIndex,
    start: start.getHours() + start.getMinutes() / 60,
    end: end.getHours() + end.getMinutes() / 60,
    start_at: start.toISOString(),
    end_at: end.toISOString(),
    session_minutes: Math.max(Math.round((end.getTime() - start.getTime()) / 60000), 1),
  })
}
