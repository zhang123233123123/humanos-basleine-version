'use server'

import { generateId } from 'ai'
import {
  createAI,
  createStreamableUI,
  createStreamableValue,
  StreamableValue,
} from 'ai/rsc'
import { ReactNode } from 'react'
import { getServerSession } from 'next-auth'
import authOptions from '@/app/api/auth/[...nextauth]/authOptions'
import { Message } from '@/components/message'
import { Check, Loader2, X } from 'lucide-react'

const HUMANOS_BACKEND = process.env.HUMANOS_BACKEND_URL || 'http://localhost:8788'

export interface ClientMessage {
  id: string
  status: ReactNode
  text: ReactNode
  gui: ReactNode
  threadIdStream?: StreamableValue<string, any>
  refetchJobsStream?: StreamableValue<number, any>
}

export async function submitMessage(
  question: string,
  threadId: string,
): Promise<ClientMessage> {
  try {
    const session = await getServerSession(authOptions)

    if (!session || !session.user?.email) {
      return {
        id: generateId(),
        status: '',
        text: 'Not authenticated',
        gui: null,
      }
    }

    const status = createStreamableUI('thread.init')
    const textStream = createStreamableValue('')
    const textUIStream = createStreamableUI(
      <Message textStream={textStream.value} />,
    )
    const gui = createStreamableUI()
    const threadIdStream = createStreamableValue(threadId)
    const refetchJobsStream = createStreamableValue(0)

    ;(async () => {
      try {
        status.update('Sending message...')

        const res = await fetch(`${HUMANOS_BACKEND}/api/chat/turn`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: session.user?.email,
            text: question,
            thread_id: threadId || undefined,
            current_time: new Date().toISOString(),
          }),
        })

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}))
          textStream.append(errData.error || 'HumanOS backend not available')
          textStream.done()
          status.done()
          gui.done()
          threadIdStream.done()
          refetchJobsStream.done()
          textUIStream.done()
          return
        }

        const data = await res.json()

        if (data.thread_id) {
          threadIdStream.update(data.thread_id)
        }

        if (data.reply) {
          textStream.append(data.reply)
        }

        if (data.tasks_changed) {
          const count = refetchJobsStream as any
          // trigger refetch via stream
        }

        refetchJobsStream.update(1)
      } catch (error: any) {
        textStream.append('Error: ' + (error.message || 'Unknown error'))
      } finally {
        status.done()
        textUIStream.done()
        gui.done()
        textStream.done()
        threadIdStream.done()
        refetchJobsStream.done()
      }
    })()

    return {
      id: generateId(),
      status: status.value,
      text: textUIStream.value,
      gui: gui.value,
      threadIdStream: threadIdStream.value,
      refetchJobsStream: refetchJobsStream.value,
    }
  } catch (error: any) {
    return {
      id: generateId(),
      status: 'Failed to submit message',
      text: error.message,
      gui: null,
    }
  }
}

export const AI = createAI({
  actions: { submitMessage },
})
