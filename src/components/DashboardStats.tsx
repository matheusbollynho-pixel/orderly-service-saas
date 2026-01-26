import { ServiceOrder, OrderStatus } from '@/types/service-order';
import { ClipboardList, Clock, Loader2, CheckCircle2 } from 'lucide-react';

interface DashboardStatsProps {
  orders: ServiceOrder[];
  onStatusClick?: (status: OrderStatus) => void;
  activeFilter?: OrderStatus | null;
}

export function DashboardStats({ orders, onStatusClick, activeFilter }: DashboardStatsProps) {
  const stats = {
    total: orders.length,
    abertas: orders.filter(o => o.status === 'aberta').length,
    emAndamento: orders.filter(o => o.status === 'em_andamento').length,
    concluidas: orders.filter(o => o.status === 'concluida').length,
  };

  const handleClick = (status: OrderStatus) => {
    if (onStatusClick) {
      onStatusClick(status);
    }
  };

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div 
        className={`card-elevated p-4 animate-fade-in cursor-pointer transition-all ${!activeFilter ? 'ring-2 ring-primary' : 'hover:shadow-lg'}`}
        onClick={() => onStatusClick && onStatusClick(null as any)}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <ClipboardList className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{stats.total}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </div>
        </div>
      </div>

      <div 
        className={`card-elevated p-4 animate-fade-in cursor-pointer transition-all ${activeFilter === 'aberta' ? 'ring-2 ring-status-open' : 'hover:shadow-lg'}`}
        onClick={() => handleClick('aberta')}
        style={{ animationDelay: '50ms' }}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-status-open/10">
            <Clock className="h-5 w-5 text-status-open" />
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{stats.abertas}</p>
            <p className="text-xs text-muted-foreground">Abertas</p>
          </div>
        </div>
      </div>

      <div 
        className={`card-elevated p-4 animate-fade-in cursor-pointer transition-all ${activeFilter === 'em_andamento' ? 'ring-2 ring-status-progress' : 'hover:shadow-lg'}`}
        onClick={() => handleClick('em_andamento')}
        style={{ animationDelay: '100ms' }}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-status-progress/10">
            <Loader2 className="h-5 w-5 text-status-progress" />
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{stats.emAndamento}</p>
            <p className="text-xs text-muted-foreground">Em Andamento</p>
          </div>
        </div>
      </div>

      <div 
        className={`card-elevated p-4 animate-fade-in cursor-pointer transition-all ${activeFilter === 'concluida' ? 'ring-2 ring-[hsl(var(--status-done))]' : 'hover:shadow-lg'}`}
        onClick={() => handleClick('concluida')}
        style={{ animationDelay: '150ms' }}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[hsl(var(--status-done))]/10">
            <CheckCircle2 className="h-5 w-5 text-[hsl(var(--status-done))]" />
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{stats.concluidas}</p>
            <p className="text-xs text-muted-foreground">Concluídas</p>
          </div>
        </div>
      </div>
    </div>
  );
}
