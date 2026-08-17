'use client'

export type TaskResourceTag = 'visual' | 'auditory' | 'verbal' | 'motor'
export type TaskAttentionMode = 'continuous' | 'intermittent' | 'passive'

const tags: Array<{ value: TaskResourceTag; zh: string; en: string }> = [
  { value: 'visual', zh: '视觉', en: 'Visual' },
  { value: 'auditory', zh: '听觉', en: 'Auditory' },
  { value: 'verbal', zh: '语言', en: 'Language' },
  { value: 'motor', zh: '动作', en: 'Motor' },
]

const attentionModes: Array<{ value: TaskAttentionMode; zh: string; en: string }> = [
  { value: 'continuous', zh: '持续参与', en: 'Continuous' },
  { value: 'intermittent', zh: '间歇参与', en: 'Intermittent' },
  { value: 'passive', zh: '后台等待', en: 'Background' },
]

export function TaskResourceFields({ locale, resourceTags, attentionMode, onResourceTagsChange, onAttentionModeChange }: {
  locale: string
  resourceTags: TaskResourceTag[]
  attentionMode: TaskAttentionMode
  onResourceTagsChange: (value: TaskResourceTag[]) => void
  onAttentionModeChange: (value: TaskAttentionMode) => void
}) {
  const zh = locale === 'zh'
  const toggle = (tag: TaskResourceTag) => onResourceTagsChange(resourceTags.includes(tag) ? resourceTags.filter((item) => item !== tag) : [...resourceTags, tag])

  return <div className="grid gap-4 rounded-xl border p-4">
    <div>
      <p className="text-sm font-medium">{zh ? '任务占用的资源' : 'Task resource tags'}</p>
      <p className="mt-1 text-xs text-muted-foreground">{zh ? '这些是并行冲突标签，不代表精力高低。' : 'These tags describe parallel conflicts, not energy.'}</p>
      <div className="mt-3 flex flex-wrap gap-2">{tags.map((tag) => <button key={tag.value} type="button" onClick={() => toggle(tag.value)} className={`rounded-full border px-3 py-1.5 text-xs ${resourceTags.includes(tag.value) ? 'border-primary bg-primary/10 text-primary' : 'hover:border-primary/50'}`}>{zh ? tag.zh : tag.en}</button>)}</div>
    </div>
    <label className="grid gap-1.5 text-sm">
      <span className="font-medium">{zh ? '注意参与方式' : 'Attention mode'}</span>
      <select value={attentionMode} onChange={(event) => onAttentionModeChange(event.target.value as TaskAttentionMode)} className="h-10 rounded-md border bg-background px-3">
        {attentionModes.map((mode) => <option key={mode.value} value={mode.value}>{zh ? mode.zh : mode.en}</option>)}
      </select>
    </label>
  </div>
}
