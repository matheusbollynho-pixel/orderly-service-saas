'use client'

import React, { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { OrdemServico, StatusOS } from './types'
import { ORDENS_MOCK } from './mock-data'

type Screen = 'dashboard' | 'lista' | 'criar' | 'detalhe'

interface AppState {
  screen: Screen
  ordens: OrdemServico[]
  selectedOS: OrdemServico | null
  navigate: (screen: Screen, os?: OrdemServico | null) => void
  addOS: (os: OrdemServico) => void
  updateOS: (os: OrdemServico) => void
  getMetrics: () => {
    total: number
    abertas: number
    em_andamento: number
    finalizadas: number
    faturamento: number
  }
}

const AppContext = createContext<AppState | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [screen, setScreen] = useState<Screen>('dashboard')
  const [ordens, setOrdens] = useState<OrdemServico[]>(ORDENS_MOCK)
  const [selectedOS, setSelectedOS] = useState<OrdemServico | null>(null)

  const navigate = useCallback((s: Screen, os?: OrdemServico | null) => {
    setScreen(s)
    if (os !== undefined) setSelectedOS(os)
  }, [])

  const addOS = useCallback((os: OrdemServico) => {
    setOrdens(prev => [os, ...prev])
  }, [])

  const updateOS = useCallback((os: OrdemServico) => {
    setOrdens(prev => prev.map(o => o.id === os.id ? os : o))
    setSelectedOS(os)
  }, [])

  const getMetrics = useCallback(() => {
    const total = ordens.length
    const abertas = ordens.filter(o => o.status === 'aberta').length
    const em_andamento = ordens.filter(o => o.status === 'em_andamento' || o.status === 'aguardando_peca').length
    const finalizadas = ordens.filter(o => o.status === 'finalizada' || o.status === 'entregue').length
    const faturamento = ordens.reduce((acc, o) => {
      return acc + o.pagamentos.reduce((a, p) => a + p.valor, 0)
    }, 0)
    return { total, abertas, em_andamento, finalizadas, faturamento }
  }, [ordens])

  return (
    <AppContext.Provider value={{ screen, ordens, selectedOS, navigate, addOS, updateOS, getMetrics }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
