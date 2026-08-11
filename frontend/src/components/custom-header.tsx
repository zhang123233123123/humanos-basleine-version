import { FC, RefObject, useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import FullCalendar from '@fullcalendar/react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Tabs } from '@/components/ui/tabs'
import { useCallback } from 'react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useDevice } from '@/hooks/use-device'
import { useTheme } from 'next-themes'
import { useTranslation } from '@/i18n/LanguageProvider'
import { LanguageSwitch } from '@/components/language-switch'

interface CustomHeaderProps {
  calendarRef: RefObject<FullCalendar>
}

const CustomHeader: FC<CustomHeaderProps> = ({ calendarRef }) => {
  const [mounted, setMounted] = useState(false)
  const [showToday, setShowToday] = useState(false)
  const [activeView, setActiveView] = useState('timeGridWeek')
  const { isMobile } = useDevice()
  const { setTheme, theme } = useTheme()
  const { t } = useTranslation()

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    const updateShowToday = () => {
      const calendarApi = calendarRef.current?.getApi()
      if (calendarApi) {
        const today = new Date()
        const start = calendarApi.view.activeStart
        const end = calendarApi.view.activeEnd
        setShowToday(today < start || today >= end)
      }
    }

    updateShowToday()

    calendarRef.current?.getApi().on('datesSet', updateShowToday)

    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      calendarRef.current?.getApi().off('datesSet', updateShowToday)
    }
  }, [calendarRef])

  const goNext = useCallback(() => {
    const calendarApi = calendarRef.current?.getApi()
    calendarApi?.next()
  }, [calendarRef])

  const goPrev = useCallback(() => {
    const calendarApi = calendarRef.current?.getApi()
    calendarApi?.prev()
  }, [calendarRef])

  function goToday() {
    const calendarApi = calendarRef.current?.getApi()
    calendarApi?.today()
  }

  function formatTitle() {
    const originalTitle = calendarRef.current?.getApi()?.view?.title

    const formattedTitle = originalTitle?.replace('.', '').replace(' de ', ' ')

    return (
      (formattedTitle?.charAt(0)?.toUpperCase() || '') +
      (formattedTitle?.slice(1) || '')
    )
  }

  function changeTab(tab: string) {
    const tabToView: Record<string, string> = {
      [t('header.month')]: 'dayGridMonth',
      [t('header.week')]: 'timeGridWeek',
      [t('header.day')]: 'timeGridDay',
    }

    const view = tabToView[tab]

    if (view) {
      setActiveView(view)
      calendarRef.current?.getApi().changeView(view)
    }
  }

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        goPrev()
      }

      if (e.key === 'ArrowRight') {
        goNext()
      }
    }

    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [goNext, goPrev])

  useEffect(() => {
    if (isMobile) {
      calendarRef.current?.getApi().changeView('timeGridDay')
      setActiveView('timeGridDay')
    }
  }, [calendarRef, isMobile, t])

  return (
    <div className="flex px-4 sm:p-0 justify-between items-center" suppressHydrationWarning>
      <div className="flex items-center justify-center gap-2">
        <h2 className="text-muted-foreground">{formatTitle()}</h2>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
        >
          {mounted ? (theme === 'light' ? <Moon /> : <Sun />) : null}
        </Button>

        <LanguageSwitch />
      </div>

      <div className="flex gap-2 items-center">
        {showToday && (
          <TooltipProvider>
            <Tooltip>
              <Button
                asChild
                onClick={goToday}
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
              >
                <TooltipTrigger>{t('header.today')}</TooltipTrigger>
              </Button>

              <TooltipContent className="flex gap-1 items-center justify-center">
                {t('header.goToToday')}
                <div className="p-1 bg-accent w-fit h-fit shrink-0 rounded-md aspect-square">
                  T
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        <div className="flex gap-1 items-center">
          <TooltipProvider>
            <Tooltip>
              <Button asChild onClick={goPrev} variant="ghost" size="sm">
                <TooltipTrigger>
                  {mounted ? <ChevronLeft /> : '\u2039'}
                </TooltipTrigger>
              </Button>

              <TooltipContent className="flex gap-1 items-center justify-center">
                {t('header.previous')}
                <div className="p-1 bg-accent w-fit h-fit shrink-0 rounded-md aspect-square">
                  <ChevronLeft size={14} />
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <Button asChild onClick={goNext} variant="ghost" size="sm">
                <TooltipTrigger>
                  {mounted ? <ChevronRight /> : '\u203A'}
                </TooltipTrigger>
              </Button>

              <TooltipContent className="flex gap-1 items-center justify-center">
                {t('header.next')}
                <div className="p-1 bg-accent w-fit h-fit shrink-0 rounded-md aspect-square">
                  <ChevronRight size={14} />
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <Tabs
          tabs={[t('header.month'), t('header.week'), t('header.day')]}
          onTabChange={changeTab}
          active={{ dayGridMonth: t('header.month'), timeGridWeek: t('header.week'), timeGridDay: t('header.day') }[activeView] || t('header.week')}
          setActive={() => undefined}
        />
      </div>
    </div>
  )
}

export default CustomHeader
