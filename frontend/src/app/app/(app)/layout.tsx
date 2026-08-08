import { ReactNode } from 'react'

export default function AppHomeLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative">
      <div className="flex-grow overflow-hidden">{children}</div>
    </div>
  )
}
