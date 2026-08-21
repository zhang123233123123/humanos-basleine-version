'use client'

import React, {
  createContext,
  Dispatch,
  SetStateAction,
  useContext,
  useState,
} from 'react'
import type { TaskFieldProvenanceRecord, TaskValueSource } from '@/lib/contracts/task-contracts'

type ActiveEvent = {
  id?: string
  uniqueId: string
  title: string
  start: Date | null
  end: Date | null
  allDay: boolean
  timeText: string
  description: string
  attendees: string[]
  status: string
  priority: string
  isPreview?: boolean
  context?: string
  progress?: string
  nextStep?: string
  openQuestions?: string
  previewAdjusted?: boolean
  adjustmentReason?: string
  duration?: number
  deadlineAt?: string
  due?: string
  taskId?: string
  executionSessionId?: string
  planRevision?: number
  missingFields?: string[]
  expectedDifficulty?: number | null
  resourceModality?: Array<'visual' | 'auditory' | 'verbal' | 'motor'>
  attentionMode?: 'continuous' | 'intermittent' | 'passive'
  parallelizable?: boolean
  dependency?: string
  createRequestId?: string
  fieldSources?: Record<string, TaskValueSource>
  fieldProvenance?: Record<string, TaskFieldProvenanceRecord>
}

type ModalContextType = {
  activeEvent: ActiveEvent | null
  setActiveEvent: Dispatch<SetStateAction<ActiveEvent | null>>
  previewTasks: ActiveEvent[]
  setPreviewTasks: Dispatch<SetStateAction<ActiveEvent[]>>
}

const ModalContext = createContext<ModalContextType | undefined>(undefined)

export const ModalProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [activeEvent, setActiveEvent] = useState<ActiveEvent | null>(null)
  const [previewTasks, setPreviewTasks] = useState<ActiveEvent[]>([])

  return (
    <ModalContext.Provider value={{ activeEvent, setActiveEvent, previewTasks, setPreviewTasks }}>
      {children}
    </ModalContext.Provider>
  )
}

export const useModal = () => {
  const context = useContext(ModalContext)
  if (context === undefined) {
    throw new Error('useModal must be used within a ModalProvider')
  }
  return context
}
