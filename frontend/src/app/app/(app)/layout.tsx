import { ReactNode } from 'react'

export default function AppHomeLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative h-full min-h-0">
      <div className="h-full min-h-0 overflow-y-auto overscroll-contain">{children}</div>
    </div>
  )
}
