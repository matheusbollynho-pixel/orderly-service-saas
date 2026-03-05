import { ServiceOrder, OrderStatus } from '@/types/service-order';
import { cn } from '@/lib/utils';
import { ClipboardList, Clock3, Loader2, CheckCircle2 } from 'lucide-react';

interface DashboardStatsProps {
  orders: ServiceOrder[];
  onStatusClick?: (status: OrderStatus | null) => void;
  activeFilter?: OrderStatus | null;
}

function MetricItem({
  label,
  value,
  icon: Icon,
  active = false,
  iconClassName,
}: {
  label: string
  value: string | number
  icon: any
  active?: boolean
  iconClassName?: string
}) {
  return (
    <div
      className={cn(
        'rounded-xl border p-4 transition-all',
        active
          ? 'border-primary/50 bg-primary/10 shadow-[0_0_0_1px_rgba(193,39,45,0.25)]'
          : 'border-border/80 bg-muted/20 hover:border-border'
      )}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </span>
        <Icon className={cn('h-4 w-4 text-muted-foreground', iconClassName)} />
      </div>

      <span className="text-3xl md:text-4xl font-black tracking-tight leading-none text-foreground">
        {value}
      </span>
    </div>
  )
}

export function DashboardStats({ orders, onStatusClick, activeFilter }: DashboardStatsProps) {
  const total = orders.length;
  const abertas = orders.filter((o) => o.status === 'aberta').length;
  const emAndamento = orders.filter((o) => o.status === 'em_andamento').length;
  const concluidas = orders.filter((o) => o.status === 'concluida').length;

  return (
    <div className="space-y-4">
      {/* Section: RESUMO */}
      <section>
        <h2 className="mb-3 text-[12px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
          <em>Resumo</em>
        </h2>

        {/* Unified metrics card - grid of 4 */}
        <div className="glass-card-elevated rounded-[8px] p-4 md:p-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            <button 
              onClick={() => onStatusClick?.(null)}
              className={cn(
                "text-left transition-transform hover:scale-[1.01]"
              )}
            >
              <MetricItem label="Total" value={total} icon={ClipboardList} active={activeFilter === null} />
            </button>
            <button 
              onClick={() => onStatusClick?.('aberta')}
              className={cn(
                "text-left transition-transform hover:scale-[1.01]"
              )}
            >
              <MetricItem label="Abertas" value={abertas} icon={Clock3} active={activeFilter === 'aberta'} />
            </button>
            <button 
              onClick={() => onStatusClick?.('em_andamento')}
              className={cn(
                "text-left transition-transform hover:scale-[1.01]"
              )}
            >
              <MetricItem
                label="EM ANDAMENTO"
                value={emAndamento}
                icon={Loader2}
                iconClassName="text-[#C1272D] animate-spin"
                active={activeFilter === 'em_andamento'}
              />
            </button>
            <button 
              onClick={() => onStatusClick?.('concluida')}
              className={cn(
                "text-left transition-transform hover:scale-[1.01]"
              )}
            >
              <MetricItem label="CONCLUÍDAS" value={concluidas} icon={CheckCircle2} iconClassName="text-emerald-500" active={activeFilter === 'concluida'} />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
