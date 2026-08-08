'use client'

import { useEffect, useState } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useTranslation } from '@/i18n/LanguageProvider'
import { toast } from 'sonner'

export default function Settings() {
  const { t } = useTranslation()
  const [profile, setProfile] = useState<any>(null)
  const [tasks, setTasks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [profileRes, tasksRes] = await Promise.all([
          fetch('/api/profile'),
          fetch('/api/tasks'),
        ])

        if (profileRes.ok) {
          const data = await profileRes.json()
          setProfile(data.profile || data)
        }
        if (tasksRes.ok) {
          const data = await tasksRes.json()
          setTasks(data.events || data.tasks || [])
        }
      } catch {
        toast(t('settings.failedToLoad'))
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">{t('settings.loading')}</p>
      </div>
    )
  }

  return (
    <div className="grid gap-6 p-4 max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>{t('profile.profileSection')}</CardTitle>
          <CardDescription>HumanOS</CardDescription>
        </CardHeader>
        <CardContent>
          {profile ? (
            <div className="grid gap-4">
              {profile.role && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('profile.role')}</span>
                  <span className="font-medium">{profile.role}</span>
                </div>
              )}
              {profile.deep_work_window && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('profile.deepWorkWindow')}</span>
                  <span className="font-medium">{profile.deep_work_window}</span>
                </div>
              )}
              {profile.low_energy_window && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('profile.lowEnergyWindow')}</span>
                  <span className="font-medium">{profile.low_energy_window}</span>
                </div>
              )}
              {profile.task_preferences?.learning_mode && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('profile.learningMode')}</span>
                  <span className="font-medium">{profile.task_preferences.learning_mode}</span>
                </div>
              )}
              {profile.task_preferences?.preferred_session_minutes && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('profile.preferredSessionMinutes')}</span>
                  <span className="font-medium">{profile.task_preferences.preferred_session_minutes} min</span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground">{t('profile.noProfile')}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('profile.tasksSection')}</CardTitle>
          <CardDescription>{tasks.length} {t('profile.tasks')}</CardDescription>
        </CardHeader>
        <CardContent>
          {tasks.length > 0 ? (
            <div className="grid gap-2">
              {tasks.map((task: any) => (
                <div
                  key={task.id}
                  className="flex justify-between items-center p-2 rounded bg-muted/50"
                >
                  <span className="font-medium">{task.title}</span>
                  <span className="text-sm text-muted-foreground">
                    {task.status || 'pending'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">{t('profile.noTasks')}</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
