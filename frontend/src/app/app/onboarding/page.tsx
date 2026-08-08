'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { useTranslation } from '@/i18n/LanguageProvider'
import { toast } from 'sonner'

const HUMANOS_BACKEND = process.env.NEXT_PUBLIC_HUMANOS_BACKEND_URL || 'http://localhost:8788'

const STEPS = [
  { step: 0, badge: 'step1of', title: 'step1Title', desc: 'step1Desc' },
  { step: 1, badge: 'step2of', title: 'step2Title', desc: 'step2Desc' },
  { step: 2, badge: 'step3of', title: 'step3Title', desc: 'step3Desc' },
  { step: 3, badge: 'step4of', title: 'step4Title', desc: 'step4Desc' },
] as const

export default function OnboardingPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)

  // Step 1: Learning Identity
  const [role, setRole] = useState('研究型学生')
  const [learningMode, setLearningMode] = useState('reading_writing')
  const [courses, setCourses] = useState('')
  const [tools, setTools] = useState('')

  // Step 2: Weekly Context
  const [availableWindows, setAvailableWindows] = useState('')
  const [nearDeadlines, setNearDeadlines] = useState('')
  const [weeklyGoal, setWeeklyGoal] = useState('')

  // Step 3: Energy Preferences
  const [deepWorkWindow, setDeepWorkWindow] = useState('09:00-11:30')
  const [lowEnergyWindow, setLowEnergyWindow] = useState('14:00-15:30')
  const [sessionMinutes, setSessionMinutes] = useState('45')
  const [controlPreference, setControlPreference] = useState('ai_proposed_user_editable')

  // Step 4: Plan Failure Patterns
  const [blockerPatterns, setBlockerPatterns] = useState<string[]>([])
  const [planningGap, setPlanningGap] = useState('')
  const [supportNeed, setSupportNeed] = useState('clarify_next_action')

  const currentStep = STEPS[step]

  const toggleBlocker = (value: string) => {
    setBlockerPatterns((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    )
  }

  const handleNext = () => {
    if (step < 3) {
      setStep(step + 1)
    }
  }

  const handleBack = () => {
    if (step > 0) {
      setStep(step - 1)
    }
  }

  const handleSkip = () => {
    router.push('/app')
  }

  const handleSubmit = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${HUMANOS_BACKEND}/api/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role,
          learning_mode: learningMode,
          current_courses: courses,
          tools,
          deep_work_window: deepWorkWindow,
          low_energy_window: lowEnergyWindow,
          preferred_session_minutes: parseInt(sessionMinutes),
          control_preference: controlPreference,
          blocker_patterns: blockerPatterns,
          planning_gap: planningGap,
          support_need: supportNeed,
        }),
      })
      if (res.ok) {
        toast('Profile saved!')
      }
    } catch {
      // continue anyway
    }
    router.push('/app')
    setLoading(false)
  }

  const selectButton = (value: string, selected: string, setter: (v: string) => void) =>
    `flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${
      selected === value
        ? 'border-primary bg-primary/10 text-primary'
        : 'border-border hover:border-primary/50'
    }`

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl">{t('onboarding.title')}</CardTitle>
              <p className="text-muted-foreground text-sm mt-1">
                {t('onboarding.subtitle')}
              </p>
            </div>
            <Badge variant="secondary">{t(`onboarding.${currentStep.badge}`)}</Badge>
          </div>
          {/* Progress dots */}
          <div className="flex gap-1.5 mt-3">
            {STEPS.map((s) => (
              <div
                key={s.step}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  s.step <= step ? 'bg-primary' : 'bg-muted'
                }`}
              />
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-6">
            <h2 className="text-lg font-semibold">{t(`onboarding.${currentStep.title}`)}</h2>
            <p className="text-muted-foreground text-sm">{t(`onboarding.${currentStep.desc}`)}</p>
          </div>

          {/* Step 1: Learning Identity */}
          {step === 0 && (
            <div className="grid gap-5">
              <div>
                <label className="text-sm font-medium block mb-2">{t('onboarding.roleLabel')}</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { v: '研究型学生', k: 'roleGraduate' },
                    { v: '课程学习学生', k: 'roleCoursework' },
                    { v: '论文写作阶段', k: 'roleThesis' },
                    { v: '项目开发阶段', k: 'roleProject' },
                  ].map(({ v, k }) => (
                    <button
                      key={v}
                      type="button"
                      className={selectButton(v, role, setRole)}
                      onClick={() => setRole(v)}
                    >
                      {t(`onboarding.${k}`)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium block mb-2">{t('onboarding.learningModeLabel')}</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { v: 'reading_writing', k: 'modeReading' },
                    { v: 'visual', k: 'modeVisual' },
                    { v: 'discussion', k: 'modeDiscussion' },
                    { v: 'practice', k: 'modePractice' },
                    { v: 'mixed', k: 'modeMixed' },
                  ].map(({ v, k }) => (
                    <button
                      key={v}
                      type="button"
                      className={selectButton(v, learningMode, setLearningMode)}
                      onClick={() => setLearningMode(v)}
                    >
                      {t(`onboarding.${k}`)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium block mb-2">{t('onboarding.coursesLabel')}</label>
                <Input
                  placeholder={t('onboarding.coursesPlaceholder')}
                  value={courses}
                  onChange={(e) => setCourses(e.target.value)}
                />
              </div>

              <div>
                <label className="text-sm font-medium block mb-2">{t('onboarding.toolsLabel')}</label>
                <Input
                  placeholder={t('onboarding.toolsPlaceholder')}
                  value={tools}
                  onChange={(e) => setTools(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Step 2: Weekly Context */}
          {step === 1 && (
            <div className="grid gap-5">
              <div>
                <label className="text-sm font-medium block mb-2">{t('onboarding.windowsLabel')}</label>
                <Input
                  placeholder={t('onboarding.windowsPlaceholder')}
                  value={availableWindows}
                  onChange={(e) => setAvailableWindows(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-2">{t('onboarding.deadlinesLabel')}</label>
                <Input
                  placeholder={t('onboarding.deadlinesPlaceholder')}
                  value={nearDeadlines}
                  onChange={(e) => setNearDeadlines(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-2">{t('onboarding.goalLabel')}</label>
                <textarea
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 min-h-[100px]"
                  placeholder={t('onboarding.goalPlaceholder')}
                  value={weeklyGoal}
                  onChange={(e) => setWeeklyGoal(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Step 3: Energy Preferences */}
          {step === 2 && (
            <div className="grid gap-5">
              <div>
                <label className="text-sm font-medium block mb-2">{t('onboarding.deepWorkLabel')}</label>
                <Input
                  placeholder={t('onboarding.deepWorkHint')}
                  value={deepWorkWindow}
                  onChange={(e) => setDeepWorkWindow(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-2">{t('onboarding.lowEnergyLabel')}</label>
                <Input
                  placeholder={t('onboarding.lowEnergyHint')}
                  value={lowEnergyWindow}
                  onChange={(e) => setLowEnergyWindow(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-2">{t('onboarding.sessionLengthLabel')}</label>
                <div className="flex gap-2">
                  {[
                    { v: '25', k: 'session25' },
                    { v: '45', k: 'session45' },
                    { v: '60', k: 'session60' },
                    { v: '90', k: 'session90' },
                  ].map(({ v, k }) => (
                    <button
                      key={v}
                      type="button"
                      className={selectButton(v, sessionMinutes, setSessionMinutes)}
                      onClick={() => setSessionMinutes(v)}
                    >
                      {t(`onboarding.${k}`)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium block mb-2">{t('onboarding.controlLabel')}</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { v: 'confirm_before_reschedule', k: 'controlConfirm' },
                    { v: 'allow_low_risk_auto', k: 'controlAutoLow' },
                  ].map(({ v, k }) => (
                    <button
                      key={v}
                      type="button"
                      className={selectButton(v, controlPreference, setControlPreference)}
                      onClick={() => setControlPreference(v)}
                    >
                      {t(`onboarding.${k}`)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Plan Failure Patterns */}
          {step === 3 && (
            <div className="grid gap-5">
              <fieldset>
                <legend className="text-sm font-medium mb-3">{t('onboarding.blockersLabel')}</legend>
                <div className="grid gap-2">
                  {[
                    { v: 'task_ambiguity', k: 'blockerAmbiguity' },
                    { v: 'fatigue', k: 'blockerFatigue' },
                    { v: 'interruption', k: 'blockerInterruption' },
                    { v: 'context_loss', k: 'blockerContextLoss' },
                  ].map(({ v, k }) => (
                    <label key={v} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={blockerPatterns.includes(v)}
                        onCheckedChange={() => toggleBlocker(v)}
                      />
                      <span className="text-sm">{t(`onboarding.${k}`)}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div>
                <label className="text-sm font-medium block mb-2">{t('onboarding.planningGapLabel')}</label>
                <textarea
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 min-h-[80px]"
                  placeholder={t('onboarding.planningGapPlaceholder')}
                  value={planningGap}
                  onChange={(e) => setPlanningGap(e.target.value)}
                />
              </div>

              <div>
                <label className="text-sm font-medium block mb-2">{t('onboarding.supportNeedLabel')}</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { v: 'clarify_next_action', k: 'supportClarify' },
                    { v: 'schedule_feasible_plan', k: 'supportSchedule' },
                    { v: 'recover_after_interruption', k: 'supportRecover' },
                    { v: 'balance_load_and_rest', k: 'supportBalance' },
                  ].map(({ v, k }) => (
                    <button
                      key={v}
                      type="button"
                      className={selectButton(v, supportNeed, setSupportNeed)}
                      onClick={() => setSupportNeed(v)}
                    >
                      {t(`onboarding.${k}`)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8">
            <div className="flex gap-2">
              <Button variant="ghost" onClick={handleSkip}>
                {t('onboarding.skip')}
              </Button>
            </div>
            <div className="flex gap-2">
              {step > 0 && (
                <Button variant="outline" onClick={handleBack}>
                  {t('onboarding.back')}
                </Button>
              )}
              {step < 3 ? (
                <Button onClick={handleNext}>{t('onboarding.next')}</Button>
              ) : (
                <Button onClick={handleSubmit} disabled={loading}>
                  {loading ? '...' : t('onboarding.finish')}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
