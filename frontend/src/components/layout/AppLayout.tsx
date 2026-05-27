'use client'

import { useAppStore } from '@/store'
import { Sidebar } from './Sidebar'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Layers, Briefcase, Settings } from 'lucide-react'

const BOTTOM_NAV = [
  { href: '/overview', label: 'Overview', icon: LayoutDashboard },
  { href: '/modules', label: 'Modules', icon: Layers },
  { href: '/jobs', label: 'Jobs', icon: Briefcase },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export function AppLayout({ children }: { children: React.ReactNode }) {
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed)
  const pathname = usePathname()

  return (
    <div className="flex h-screen bg-bg-base overflow-hidden">
      {/* Sidebar — hidden on mobile */}
      <div className="hidden md:block">
        <Sidebar />
      </div>

      {/* Main content */}
      <main
        className={cn(
          'flex-1 overflow-auto transition-all duration-200',
          'md:ml-[240px]',
          sidebarCollapsed && 'md:ml-[52px]',
          'pb-16 md:pb-0' // space for mobile bottom bar
        )}
      >
        {children}
      </main>

      {/* Mobile bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 h-16 bg-bg-surface border-t border-border flex items-center md:hidden z-40">
        {BOTTOM_NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex-1 flex flex-col items-center justify-center gap-1 h-full transition-colors',
                active ? 'text-text-primary' : 'text-text-muted'
              )}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px]">{label}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
