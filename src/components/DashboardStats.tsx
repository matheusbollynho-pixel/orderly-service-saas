import { ServiceOrder } from '@/types/service-order';
import { ClipboardList, Clock, Loader2, CheckCircle2 } from 'lucide-react';

interface DashboardStatsProps {
  orders: ServiceOrder[];
}

export function DashboardStats({ orders }: DashboardStatsProps) {
  const stats = {
    total: orders.length,
    abertas: orders.filter(o => o.status === 'aberta').length,
    emAndamento: orders.filter(o => o.status === 'em_andamento').length,
    concluidas: orders.filter(o => o.status === 'concluida').length,
  };

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div className="card-elevated p-4 animate-fade-in">
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

      <div className="card-elevated p-4 animate-fade-in" style={{ animationDelay: '50ms' }}>
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

      <div className="card-elevated p-4 animate-fade-in" style={{ animationDelay: '100ms' }}>
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

      <div className="card-elevated p-4 animate-fade-in" style={{ animationDelay: '150ms' }}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-status-done/10">
            <CheckCircle2 className="h-5 w-5 text-status-done" />
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
