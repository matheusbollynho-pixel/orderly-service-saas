'use client'

import { useApp } from '@/lib/store'
import { ArrowLeft } from 'lucide-react'

const SCREEN_TITLES: Record<string, string> = {
  dashboard: 'Dashboard',
  lista: 'Ordens de Servico',
  criar: 'Nova OS',
  detalhe: 'Detalhe da OS',
}

export function Header() {
  const { screen, navigate } = useApp()
  const canGoBack = screen === 'detalhe' || screen === 'criar'
  const backTarget = screen === 'detalhe' ? 'lista' : 'dashboard'

  return (
    <header className="sticky top-0 z-50 glass-card-elevated border-b border-border">
      <div className="flex items-center h-12 px-4">
        {/* Left: back button */}
        <div className="w-16 flex-shrink-0">
          {canGoBack && (
            <button
              onClick={() => navigate(backTarget as 'lista' | 'dashboard', null)}
              className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground hover:text-primary transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
              Voltar
            </button>
          )}
        </div>

        {/* Center: screen title */}
        <h1 className="flex-1 text-center text-xs font-bold uppercase tracking-[0.2em] text-foreground">
          {SCREEN_TITLES[screen] || ''}
        </h1>

        {/* Right: spacer for symmetry */}
        <div className="w-16 flex-shrink-0" />
      </div>
    </header>
  )
}
