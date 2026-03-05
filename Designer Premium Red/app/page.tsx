'use client'

import { AppProvider, useApp } from '@/lib/store'
import { Header } from '@/components/header'
import { BottomNav } from '@/components/bottom-nav'
import { Dashboard } from '@/components/dashboard'
import { OSList } from '@/components/os-list'
import { OSForm } from '@/components/os-form'
import { OSDetail } from '@/components/os-detail'

function AppContent() {
  const { screen } = useApp()

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <Header />
      <main className="flex-1 overflow-y-auto pb-safe">
        {screen === 'dashboard' && <Dashboard />}
        {screen === 'lista' && <OSList />}
        {screen === 'criar' && <OSForm />}
        {screen === 'detalhe' && <OSDetail />}
      </main>
      <BottomNav />
    </div>
  )
}

export default function Page() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  )
}
