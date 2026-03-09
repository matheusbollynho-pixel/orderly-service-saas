'use client'

import { LayoutDashboard, ClipboardList, PlusCircle } from 'lucide-react'
import { useApp } from '@/lib/store'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { id: 'dashboard' as const, label: 'Painel', icon: LayoutDashboard },
  { id: 'lista' as const, label: 'Ordens', icon: ClipboardList },
  { id: 'criar' as const, label: 'Nova OS', icon: PlusCircle },
]

export function BottomNav() {
  const { screen, navigate } = useApp()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 glass-card-elevated border-t border-border">
      <div className="flex h-14 items-center justify-around px-4 pb-[env(safe-area-inset-bottom)]">
        {NAV_ITEMS.map(item => {
          const isActive = screen === item.id || (item.id === 'lista' && screen === 'detalhe')
          const Icon = item.icon
          return (
            <button
              key={item.id}
              onClick={() => navigate(item.id, null)}
              className={cn(
                'flex flex-col items-center gap-0.5 rounded-[4px] px-5 py-1 transition-colors',
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-primary'
              )}
            >
              <Icon className="h-4.5 w-4.5" strokeWidth={isActive ? 2 : 1.5} />
              <span className="text-[9px] font-bold uppercase tracking-[0.15em]">
                {item.label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
