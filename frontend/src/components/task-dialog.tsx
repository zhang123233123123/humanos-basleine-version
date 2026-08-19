'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTranslation } from '@/i18n/LanguageProvider'
import { toast } from 'sonner'
import { TaskResourceFields, type TaskAttentionMode, type TaskResourceTag } from '@/components/task-resource-fields'

interface TaskData {
  id?: string
  title: string
  due?: string
  duration?: number
  priority?: string
  status?: string
  context?: string
  progress?: string
  nextStep?: string
  openQuestions?: string
  resourceModality?: TaskResourceTag[]
  attentionMode?: TaskAttentionMode
  parallelizable?: boolean
}

interface TaskDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (task: TaskData) => Promise<void>
  onDelete?: () => Promise<void>
  initialData?: TaskData
}

export function TaskDialog({
  open,
  onOpenChange,
  onSave,
  onDelete,
  initialData,
}: TaskDialogProps) {
  const { t, locale } = useTranslation()
  const [loading, setLoading] = useState(false)

  const [title, setTitle] = useState(initialData?.title || '')
  const [due, setDue] = useState(initialData?.due || '')
  const [duration, setDuration] = useState(initialData?.duration?.toString() || '90')
  const [priority, setPriority] = useState(initialData?.priority || '中')
  const [status, setStatus] = useState(initialData?.status || 'queued')
  const [context, setContext] = useState(initialData?.context || '')
  const [progress, setProgress] = useState(initialData?.progress || '')
  const [nextStep, setNextStep] = useState(initialData?.nextStep || '')
  const [openQuestions, setOpenQuestions] = useState(initialData?.openQuestions || '')
  const [resourceModality, setResourceModality] = useState<TaskResourceTag[]>(initialData?.resourceModality || [])
  const [attentionMode, setAttentionMode] = useState<TaskAttentionMode>(initialData?.attentionMode || 'continuous')
  const [parallelizable, setParallelizable] = useState(Boolean(initialData?.parallelizable))

  const isEdit = !!initialData?.id
  const initialResourceKey = (initialData?.resourceModality || []).join('|')

  useEffect(() => {
    if (!open) return
    setTitle(initialData?.title || '')
    setDue(initialData?.due || '')
    setDuration(initialData?.duration?.toString() || '90')
    setPriority(initialData?.priority || '中')
    setStatus(initialData?.status || 'queued')
    setContext(initialData?.context || '')
    setProgress(initialData?.progress || '')
    setNextStep(initialData?.nextStep || '')
    setOpenQuestions(initialData?.openQuestions || '')
    setResourceModality(initialResourceKey ? initialResourceKey.split('|') as TaskResourceTag[] : [])
    setAttentionMode(initialData?.attentionMode || 'continuous')
    setParallelizable(Boolean(initialData?.parallelizable))
  }, [open, initialData?.id, initialData?.title, initialData?.due, initialData?.duration, initialData?.priority, initialData?.status, initialData?.context, initialData?.progress, initialData?.nextStep, initialData?.openQuestions, initialResourceKey, initialData?.attentionMode, initialData?.parallelizable])

  const handleSave = async () => {
    if (!title.trim()) {
      toast('Please enter a task name')
      return
    }
    setLoading(true)
    try {
      await onSave({
        id: initialData?.id,
        title: title.trim(),
        due,
        duration: parseInt(duration) || 90,
        priority,
        status,
        context,
        progress,
        nextStep,
        openQuestions,
        resourceModality,
        attentionMode,
        parallelizable,
      })
      onOpenChange(false)
    } catch {
      toast('Failed to save task')
    }
    setLoading(false)
  }

  const handleDelete = async () => {
    if (!onDelete) return
    setLoading(true)
    try {
      await onDelete()
      onOpenChange(false)
    } catch {
      toast('Failed to delete task')
    }
    setLoading(false)
  }

  const selectBtn = (value: string, selected: string, setter: (v: string) => void) =>
    `px-3 py-1.5 text-xs rounded-md border transition-colors ${
      selected === value
        ? 'border-primary bg-primary/10 text-primary'
        : 'border-border hover:border-primary/50'
    }`

  const textareaClass =
    'flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 min-h-[60px] resize-y'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t('taskDialog.editTask') : t('taskDialog.addTask')}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-4 flex-1 overflow-y-auto">
          {/* Task Name */}
          <div>
            <label className="text-sm font-medium block mb-1.5">{t('taskDialog.titleLabel')}</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          {/* Due + Duration row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium block mb-1.5">{t('taskDialog.dueLabel')}</label>
              <Input
                placeholder={t('taskDialog.duePlaceholder')}
                value={due}
                onChange={(e) => setDue(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1.5">{t('taskDialog.durationLabel')}</label>
              <Input
                type="number"
                min={15}
                step={15}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </div>
          </div>

          {/* Priority + Status row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium block mb-1.5">{t('taskDialog.priorityLabel')}</label>
              <div className="flex gap-1">
                {[
                  { v: '高', k: 'priorityHigh' },
                  { v: '中', k: 'priorityMedium' },
                  { v: '低', k: 'priorityLow' },
                ].map(({ v, k }) => (
                  <button
                    key={v}
                    type="button"
                    className={selectBtn(v, priority, setPriority)}
                    onClick={() => setPriority(v)}
                  >
                    {t(`taskDialog.${k}`)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1.5">{t('taskDialog.statusLabel')}</label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="queued">{t('taskDialog.statusQueued')}</option>
                <option value="scheduled">{t('taskDialog.statusScheduled')}</option>
                <option value="running">{t('taskDialog.statusRunning')}</option>
                <option value="paused">{t('taskDialog.statusPaused')}</option>
                <option value="completed">{t('taskDialog.statusCompleted')}</option>
              </select>
            </div>
          </div>

          {/* Context */}
          <TaskResourceFields locale={locale} resourceTags={resourceModality} attentionMode={attentionMode} onResourceTagsChange={setResourceModality} onAttentionModeChange={setAttentionMode} />
          <label className="flex items-start gap-3 rounded-xl border p-3 text-sm">
            <input type="checkbox" className="mt-1" checked={parallelizable} onChange={(event) => setParallelizable(event.target.checked)} />
            <span><span className="font-medium">{locale === 'zh' ? '允许系统提出并行建议' : 'Allow parallel suggestions'}</span><span className="mt-1 block text-xs text-muted-foreground">{locale === 'zh' ? '资源标签只用于检查兼容性；真正合并执行仍会再次征求确认。' : 'Resource labels only check compatibility; combining still requires confirmation.'}</span></span>
          </label>

          {/* Context */}
          <div>
            <label className="text-sm font-medium block mb-1.5">{t('taskDialog.contextLabel')}</label>
            <textarea
              className={textareaClass}
              placeholder={t('taskDialog.contextPlaceholder')}
              value={context}
              onChange={(e) => setContext(e.target.value)}
              rows={2}
            />
          </div>

          {/* Progress */}
          <div>
            <label className="text-sm font-medium block mb-1.5">{t('taskDialog.progressLabel')}</label>
            <textarea
              className={textareaClass}
              placeholder={t('taskDialog.progressPlaceholder')}
              value={progress}
              onChange={(e) => setProgress(e.target.value)}
              rows={2}
            />
          </div>

          {/* Next Step */}
          <div>
            <label className="text-sm font-medium block mb-1.5">{t('taskDialog.nextStepLabel')}</label>
            <textarea
              className={textareaClass}
              placeholder={t('taskDialog.nextStepPlaceholder')}
              value={nextStep}
              onChange={(e) => setNextStep(e.target.value)}
              rows={2}
            />
          </div>

          {/* Open Questions */}
          <div>
            <label className="text-sm font-medium block mb-1.5">{t('taskDialog.openQuestionsLabel')}</label>
            <textarea
              className={textareaClass}
              placeholder={t('taskDialog.openQuestionsPlaceholder')}
              value={openQuestions}
              onChange={(e) => setOpenQuestions(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <div className="flex justify-between border-t pt-4 shrink-0">
          <div>
            {isEdit && onDelete && (
              <Button variant="destructive" onClick={handleDelete} disabled={loading}>
                {t('taskDialog.deleteTask')}
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('taskDialog.cancel')}
            </Button>
            <Button onClick={handleSave} disabled={loading}>
              {loading ? '...' : t('taskDialog.save')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
