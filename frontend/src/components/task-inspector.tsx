'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from '@/i18n/LanguageProvider'
import { Button } from '@/components/ui/button'
import { Check, Play, Save, X } from 'lucide-react'
import { toast } from 'sonner'

interface TaskDetail {
  id: string
  title: string
  status?: string
  priority?: string
  context?: string
  progress?: string
  nextStep?: string
  openQuestions?: string
  description?: string
  duration?: number
  isPreview?: boolean
  start?: Date | null
  end?: Date | null
}

interface TaskInspectorProps {
  task: TaskDetail | null
  onConfirm?: (task: TaskDetail) => Promise<void>
  onReject?: () => void
  onSave?: (task: TaskDetail) => Promise<void>
  onOpenFocus?: (task: TaskDetail) => Promise<void>
}

function InspectorContent({ task, onConfirm, onReject, onSave, onOpenFocus }: TaskInspectorProps) {
  const { t } = useTranslation()
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)

  // Editable state — initialized from task
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState('medium')
  const [status, setStatus] = useState('queued')
  const [context, setContext] = useState('')
  const [progress, setProgress] = useState('')
  const [nextStep, setNextStep] = useState('')
  const [openQuestions, setOpenQuestions] = useState('')

  // Sync local state when task changes
  useEffect(() => {
    if (task) {
      setTitle(task.title || '')
      setPriority(task.priority || 'medium')
      setStatus(task.status || 'queued')
      setContext(task.context || task.description || '')
      setProgress(task.progress || '')
      setNextStep(task.nextStep || '')
      setOpenQuestions(task.openQuestions || '')
    }
  }, [task?.id, task?.start, task?.end])  // re-sync when task identity changes

  // Build current editable task object
  const buildTask = useCallback((): TaskDetail => {
    if (!task) return { id: '', title: '' }
    return {
      ...task,
      title,
      priority,
      status,
      context,
      progress,
      nextStep,
      openQuestions,
    }
  }, [task, title, priority, status, context, progress, nextStep, openQuestions])

  if (!task) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm p-4 text-center">
        {t('workspace.noTaskSelected')}
      </div>
    )
  }

  const statusLabels: Record<string, string> = { queued: t('taskDialog.statusQueued'), scheduled: t('taskDialog.statusScheduled'), ready: t('taskDialog.statusScheduled'), running: t('taskDialog.statusRunning'), paused: t('taskDialog.statusPaused'), ended: t('taskDialog.statusCompleted'), completed: t('taskDialog.statusCompleted'), blocked: 'Blocked', terminated: 'Terminated' }

  const priorityOptions = [
    { value: 'high', label: t('taskDialog.priorityHigh'), color: 'text-red-500 bg-red-500/10 border-red-500/30' },
    { value: 'medium', label: t('taskDialog.priorityMedium'), color: 'text-amber-500 bg-amber-500/10 border-amber-500/30' },
    { value: 'low', label: t('taskDialog.priorityLow'), color: 'text-green-500 bg-green-500/10 border-green-500/30' },
  ]

  const priorityColors: Record<string, string> = {
    high: 'text-red-500 bg-red-500/10',
    medium: 'text-amber-500 bg-amber-500/10',
    low: 'text-green-500 bg-green-500/10',
  }

  const isExistingTask = !task.isPreview && task.id && !task.id.startsWith('preview-')

  const handleSave = async () => {
    if (!onSave) return
    setSaving(true)
    try {
      await onSave(buildTask())
      toast(t('workspace.saved'))
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Failed to save task')
    } finally {
      setSaving(false)
    }
  }

  const handleConfirm = async () => {
    if (!onConfirm) return
    setConfirming(true)
    try {
      await onConfirm(buildTask())
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Failed to confirm task')
    } finally {
      setConfirming(false)
    }
  }

  const inputClass = 'w-full text-xs px-2 py-1.5 rounded border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary'
  const textareaClass = 'w-full text-xs px-2 py-1.5 rounded border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary resize-none'
  const labelClass = 'text-xs font-semibold mb-1 block'
  const hintClass = 'text-[10px] text-muted-foreground mb-1.5 block'

  return (
    <>
      {/* Header */}
      <div className="border-b border-border p-3">
        <h2 className="text-sm font-semibold">
          {isExistingTask ? t('workspace.editTitle') : t('workspace.taskDetail')}
        </h2>
        <div className="mt-2 space-y-2">
          {/* Title - editable for existing tasks, read-only for preview */}
          {isExistingTask ? (
            <input
              className={`${inputClass} font-medium`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          ) : (
            <h3 className="font-medium text-sm">{task.title}</h3>
          )}

          {/* Priority selector */}
          <div>
            <span className={labelClass}>{t('taskDialog.priorityLabel')}</span>
            <div className="flex gap-1">
              {priorityOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setPriority(opt.value)}
                  className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                    priority === opt.value
                      ? opt.color + ' border-current'
                      : 'border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Status is owned by the execution lifecycle, not edited locally. */}
          <div>
            <span className={labelClass}>{t('taskDialog.statusLabel')}</span>
            <span className="inline-flex rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary">{statusLabels[status] || status}</span>
          </div>
        </div>
      </div>

      {/* Confirm / Reject for preview tasks */}
      {task.isPreview && onConfirm && onReject && (
        <div className="border-b border-border p-3">
          <p className="text-xs font-semibold mb-2">{t('workspace.pendingSchedule')}</p>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1 text-xs h-8"
              disabled={confirming}
              onClick={handleConfirm}
            >
              <Check className="w-3.5 h-3.5 mr-1" />
              {t('workspace.confirmCalendar')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 text-xs h-8"
              onClick={onReject}
            >
              <X className="w-3.5 h-3.5 mr-1" />
              {t('workspace.reject')}
            </Button>
          </div>
        </div>
      )}

      {/* Save button for existing tasks */}
      {isExistingTask && onSave && (
        <div className="border-b border-border p-3">
          {onOpenFocus && !['completed', 'ended', 'terminated'].includes(status) && <Button size="sm" className="mb-2 h-9 w-full text-xs" onClick={() => void onOpenFocus(buildTask())}><Play className="mr-1 h-3.5 w-3.5" />{status === 'running' || status === 'paused' ? 'Open Focus' : 'Start and enter Focus'}</Button>}
          <Button
            size="sm"
            className="w-full text-xs h-8"
            disabled={saving}
            onClick={handleSave}
          >
            <Save className="w-3.5 h-3.5 mr-1" />
            {t('workspace.saveChanges')}
          </Button>
        </div>
      )}

      {/* Context */}
      <div className="border-b border-border p-3">
        <h3 className={labelClass}>{t('taskDialog.contextLabel')}</h3>
        <span className={hintClass}>{t('workspace.contextHint')}</span>
        <textarea
          className={textareaClass}
          rows={3}
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder={t('taskDialog.contextPlaceholder')}
        />
      </div>

      {/* Progress */}
      <div className="border-b border-border p-3">
        <h3 className={labelClass}>{t('taskDialog.progressLabel')}</h3>
        <textarea
          className={textareaClass}
          rows={3}
          value={progress}
          onChange={(e) => setProgress(e.target.value)}
          placeholder={t('taskDialog.progressPlaceholder')}
        />
      </div>

      {/* Next Step */}
      <div className="border-b border-border p-3">
        <h3 className={labelClass}>{t('taskDialog.nextStepLabel')}</h3>
        <span className={hintClass}>{t('workspace.resumeHint')}</span>
        <textarea
          className={`${textareaClass} bg-primary/5 border-primary/10`}
          rows={2}
          value={nextStep}
          onChange={(e) => setNextStep(e.target.value)}
          placeholder={t('taskDialog.nextStepPlaceholder')}
        />
      </div>

      {/* Open Questions */}
      <div className="border-b border-border p-3">
        <h3 className={labelClass}>{t('taskDialog.openQuestionsLabel')}</h3>
        <textarea
          className={textareaClass}
          rows={2}
          value={openQuestions}
          onChange={(e) => setOpenQuestions(e.target.value)}
          placeholder={t('taskDialog.openQuestionsPlaceholder')}
        />
      </div>

      {/* Interruptions */}
      <div className="border-b border-border p-3">
        <h3 className={labelClass}>{t('workspace.interruptions')}</h3>
        <span className={hintClass}>{t('workspace.interruptionsHint')}</span>
        <textarea
          className={textareaClass}
          rows={2}
          placeholder={t('workspace.interruptionsHint')}
        />
      </div>

      {/* Recovery */}
      <div className="border-b border-border p-3">
        <h3 className={labelClass}>{t('workspace.recovery')}</h3>
        <span className={hintClass}>{t('workspace.recoveryHint')}</span>
        <textarea
          className={textareaClass}
          rows={2}
          placeholder={t('workspace.recoveryHint')}
        />
      </div>
    </>
  )
}

export function TaskInspector({ task, onConfirm, onReject, onSave, onOpenFocus }: TaskInspectorProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  return (
    <aside className="w-72 shrink-0 border-l border-border h-full flex flex-col bg-background overflow-y-auto" suppressHydrationWarning>
      {mounted ? <InspectorContent task={task} onConfirm={onConfirm} onReject={onReject} onSave={onSave} onOpenFocus={onOpenFocus} /> : null}
    </aside>
  )
}
