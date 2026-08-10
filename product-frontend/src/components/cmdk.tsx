'use client'

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { CalendarIcon, Sparkle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useChat } from '@/hooks/use-chat'
import { useCommandK } from '@/hooks/use-command'
import { useTranslation } from '@/i18n/LanguageProvider'

export function CommandK() {
  const { setChatOpen, chatOpen } = useChat()
  const { commandKOpen, setCommandKOpen } = useCommandK()
  const { t } = useTranslation()
  const [inputValue, setInputValue] = useState('')

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setCommandKOpen(!commandKOpen)
      }

      if (!chatOpen) {
        if (e.key === 'q') {
          if (!chatOpen) {
            setChatOpen('Hello!')
          }
        }
      }
    }

    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [chatOpen, commandKOpen, setChatOpen, setCommandKOpen])

  const items = [
    {
      title: t('cmdk.openCalendar'),
      icon: <CalendarIcon size={16} />,
    },
  ]

  const [filteredItems, setFilteredItems] = useState<any[]>(items)

  const customFilter = (value: string, search: string, keywords?: string[]) => {
    if (!search) return 1

    if (value === t('cmdk.askAssistant')) {
      return 1
    }

    if (keywords?.includes('event_details')) {
      return 1
    }

    return value.toLocaleLowerCase().includes(search.toLocaleLowerCase())
      ? 1
      : 0
  }

  return (
    <CommandDialog open={commandKOpen} onOpenChange={setCommandKOpen}>
      <div className="flex items-center border-b p-3">
        <input
          className="w-full bg-transparent outline-none"
          placeholder={t('cmdk.placeholder')}
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value)
            setFilteredItems(
              items.filter((item) => customFilter(item.title, e.target.value)),
            )
          }}
        />
      </div>

      <CommandList>
        <CommandEmpty>{t('cmdk.noResults')}</CommandEmpty>

        <CommandGroup heading={t('cmdk.actions')}>
          <CommandItem
            onSelect={() => {
              setCommandKOpen(false)
              setChatOpen(inputValue)
              setInputValue('')
            }}
            className="gap-2"
          >
            <Sparkle size={16} />
            <span>{t('cmdk.askAssistant')}</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        {filteredItems.length > 0 && (
          <CommandGroup heading={t('cmdk.suggestions')}>
            {filteredItems.map((item) => (
              <CommandItem key={item.title} className="gap-2">
                {item.icon}
                <span>{item.title}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  )
}
