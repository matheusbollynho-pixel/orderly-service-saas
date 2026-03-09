'use client'

import { useState, useMemo } from 'react'
import { Search, X, ChevronRight, PlusCircle, ClipboardList, Filter } from 'lucide-react'
import { useApp } from '@/lib/store'
import { Badge } from '@/components/ui/badge'
import { STATUS_LABELS, STATUS_COLORS, type StatusOS } from '@/lib/types'
import { cn, formatDateShort } from '@/lib/utils'

const ALL_STATUSES: StatusOS[] = ['aberta', 'em_andamento', 'aguardando_peca', 'finalizada', 'entregue']

export function OSList() {
  const { ordens, navigate } = useApp()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusOS | 'todos'>('todos')

  const filtered = useMemo(() => {
    return ordens.filter(os => {
      const matchSearch = search === '' || [
        os.cliente.nome,
        os.cliente.telefone,
        os.cliente.cpf,
        os.numero.toString(),
        ...os.motos.map(m => m.placa),
      ].some(field => field?.toLowerCase().includes(search.toLowerCase()))

      const matchStatus = statusFilter === 'todos' || os.status === statusFilter
      return matchSearch && matchStatus
    })
  }, [ordens, search, statusFilter])

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" strokeWidth={1.5} />
        <input
          type="text"
          placeholder="Buscar por nome, placa ou ID..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full rounded-[4px] border border-border bg-input py-2 pl-9 pr-9 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
        <Filter className="h-3 w-3 text-muted-foreground shrink-0" strokeWidth={1.5} />
        <button
          onClick={() => setStatusFilter('todos')}
          className={cn(
            'shrink-0 rounded-[4px] border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider transition-colors',
            statusFilter === 'todos'
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/20'
          )}
        >
          Todas
        </button>
        {ALL_STATUSES.map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={cn(
              'shrink-0 rounded-[4px] border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider transition-colors',
              statusFilter === s
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/20'
            )}
          >
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="glass-card rounded-[4px] p-6 flex flex-col items-center gap-2 text-center mt-2">
          <ClipboardList className="h-8 w-8 text-muted-foreground/40" strokeWidth={1} />
          <p className="text-xs text-muted-foreground">
            {search || statusFilter !== 'todos'
              ? 'Nenhuma OS encontrada com esses filtros'
              : 'Nenhuma OS registrada'}
          </p>
          {!search && statusFilter === 'todos' && (
            <button
              onClick={() => navigate('criar')}
              className="mt-1 inline-flex items-center gap-1.5 rounded-[4px] bg-primary px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <PlusCircle className="h-3.5 w-3.5" strokeWidth={1.5} />
              Criar primeira OS
            </button>
          )}
          {(search || statusFilter !== 'todos') && (
            <button
              onClick={() => { setSearch(''); setStatusFilter('todos') }}
              className="mt-1 text-[10px] font-bold uppercase tracking-wider text-primary hover:text-primary/80 transition-colors"
            >
              Limpar filtros
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">
            {filtered.length} {filtered.length === 1 ? 'ordem' : 'ordens'}
          </p>
          {filtered.map(os => (
            <button
              key={os.id}
              onClick={() => navigate('detalhe', os)}
              className="group glass-card rounded-[4px] px-3 py-2.5 flex items-center gap-3 text-left transition-all hover:bg-accent/60 active:scale-[0.995]"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono font-bold text-primary">
                    #{os.numero}
                  </span>
                  <Badge
                    variant="outline"
                    className={cn('text-[9px] rounded-[2px] border px-1.5 py-0 leading-4', STATUS_COLORS[os.status])}
                  >
                    {STATUS_LABELS[os.status]}
                  </Badge>
                  <span className="ml-auto text-[10px] text-muted-foreground/50 font-mono">
                    {formatDateShort(os.data_entrada)}
                  </span>
                </div>
                <p className="text-xs font-semibold text-foreground/90 truncate mt-0.5">
                  {os.cliente.nome}
                  <span className="font-normal text-muted-foreground"> - {os.motos.map(m => `${m.modelo} (${m.placa})`).join(' | ')}</span>
                </p>
              </div>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0 icon-hover" strokeWidth={1.5} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
