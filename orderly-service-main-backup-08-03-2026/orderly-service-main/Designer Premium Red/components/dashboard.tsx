'use client'

import { ChevronRight, PlusCircle, ClipboardList } from 'lucide-react'
import { useApp } from '@/lib/store'
import { Badge } from '@/components/ui/badge'
import { STATUS_LABELS, STATUS_COLORS } from '@/lib/types'
import { cn, formatDateShort } from '@/lib/utils'

function MetricItem({
  label,
  value,
  accent = false,
}: {
  label: string
  value: string | number
  accent?: boolean
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          'text-xl font-black tracking-tight leading-none',
          accent ? 'text-primary' : 'text-foreground'
        )}
      >
        {value}
      </span>
    </div>
  )
}

export function Dashboard() {
  const { ordens, navigate, getMetrics } = useApp()
  const metrics = getMetrics()
  const recentes = ordens.slice(0, 4)

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Section: RESUMO */}
      <section>
        <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
          <em>Resumo</em>
        </h2>

        {/* Unified metrics card - grid of 4 */}
        <div className="glass-card-elevated rounded-[4px] p-4">
          <div className="grid grid-cols-4 gap-4">
            <MetricItem label="Total" value={metrics.total} />
            <MetricItem label="Abertas" value={metrics.abertas} accent />
            <MetricItem label="Servico" value={metrics.em_andamento} />
            <MetricItem label="Prontas" value={metrics.finalizadas} />
          </div>
        </div>
      </section>

      {/* Faturamento - separate smaller card */}
      <section>
        <div className="glass-card rounded-[4px] p-3 flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            Faturamento
          </span>
          <span className="text-lg font-black tracking-tight text-foreground">
            R$ {metrics.faturamento.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </span>
        </div>
      </section>

      {/* Section: RECENTES */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            <em>Recentes</em>
          </h2>
          <button
            onClick={() => navigate('lista')}
            className="rounded-[4px] border border-primary/40 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
          >
            Ver todas
          </button>
        </div>

        {recentes.length === 0 ? (
          <div className="glass-card rounded-[4px] p-6 flex flex-col items-center gap-2 text-center">
            <ClipboardList className="h-8 w-8 text-muted-foreground/40 icon-hover" strokeWidth={1} />
            <p className="text-xs text-muted-foreground">
              Nenhuma OS registrada
            </p>
            <button
              onClick={() => navigate('criar')}
              className="mt-1 inline-flex items-center gap-1.5 rounded-[4px] bg-primary px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <PlusCircle className="h-3.5 w-3.5" strokeWidth={1.5} />
              Criar primeira OS
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {recentes.map(os => (
              <button
                key={os.id}
                onClick={() => navigate('detalhe', os)}
                className="group glass-card rounded-[4px] px-3 py-2.5 flex items-center gap-3 text-left transition-all hover:bg-accent/60 active:scale-[0.995]"
              >
                <div className="flex-1 min-w-0">
                  {/* Compact line: ID + Status */}
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
                  {/* Client + Motos in one line */}
                  <p className="text-xs font-semibold text-foreground/90 truncate mt-0.5">
                    {os.cliente.nome}
                    <span className="font-normal text-muted-foreground"> - {os.motos.map(m => m.modelo).join(', ')}</span>
                  </p>
                </div>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0 icon-hover" strokeWidth={1.5} />
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
