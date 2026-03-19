import { ServiceOrder, STATUS_OFICINA_LABELS, STATUS_OFICINA_COLORS } from '@/types/service-order';
import { StatusBadge } from './StatusBadge';
import { Card, CardContent } from '@/components/ui/card';
import { MapPin, Phone, Wrench, ChevronRight, Calendar } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface OrderCardProps {
  order: ServiceOrder;
  onClick: () => void;
}

export function OrderCard({ order, onClick }: OrderCardProps) {
  const completedItems = order.checklist_items?.filter(i => i.completed).length ?? 0;
  const totalItems = order.checklist_items?.length ?? 0;
  const progress = totalItems > 0 ? (completedItems / totalItems) * 100 : 0;
  const isExpress = (order.problem_description || '').toLowerCase().includes('cadastro express');

  const toSafeDate = (value?: string | null) => {
    if (!value) return null;
    const normalized = value.includes('T') ? value : `${value}T00:00:00`;
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  return (
    <Card 
      className="glass-card-elevated cursor-pointer border border-border/80 transition-all hover:border-primary/35 hover:shadow-elevated active:scale-[0.995] animate-slide-up rounded-[8px]"
      onClick={onClick}
    >
      <CardContent className="p-4 md:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2.5">
              <h3 className="font-bold text-foreground truncate text-[18px] tracking-[0.02em]">{order.client_name}</h3>
              <StatusBadge status={order.status} />
              {order.status_oficina && (
                <span className={`text-[9px] font-semibold uppercase tracking-[0.1em] px-2 py-0.5 rounded-full border ${STATUS_OFICINA_COLORS[order.status_oficina]}`}>
                  {STATUS_OFICINA_LABELS[order.status_oficina]}
                </span>
              )}
              {isExpress && (
                <span className="text-[9px] font-semibold uppercase tracking-[0.12em] px-2 py-0.5 rounded-full bg-[#C1272D]/20 text-[#C1272D] border border-[#C1272D]/40">
                  Express
                </span>
              )}
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Wrench className="h-3.5 w-3.5 flex-shrink-0 text-[#C1272D]" />
                <span className="truncate text-[13px]">{order.equipment}</span>
              </div>
              
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate text-[13px]">{order.client_address}</span>
              </div>
              
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Phone className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="text-[13px]">{order.client_phone}</span>
              </div>
            </div>

            {totalItems > 0 && (
              <div className="mt-3.5">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Progresso</span>
                  <span className="font-semibold text-foreground">{completedItems}/{totalItems}</span>
                </div>
                <div className="h-1.5 bg-muted/70 rounded-full overflow-hidden">
                  <div 
                    className="h-full rounded-full transition-all duration-300 bg-gradient-to-r from-[#C1272D] to-red-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground mt-3.5">
              {(() => {
                const createdAt = toSafeDate(order.created_at);
                return createdAt
                  ? formatDistanceToNow(createdAt, { addSuffix: true, locale: ptBR })
                  : '';
              })()}
            </p>
          </div>
          
          <div className="flex flex-col items-end gap-2 min-w-[78px]">
            <ChevronRight className="h-4.5 w-4.5 text-muted-foreground/70 mt-1" />
            {order.entry_date && (
              <div className="flex flex-col items-end gap-0.5">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.12em]">Entrada</span>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  <span>
                    {(() => {
                      const entryDate = toSafeDate(order.entry_date);
                      return entryDate ? format(entryDate, 'dd/MM/yy') : '';
                    })()}
                  </span>
                </div>
              </div>
            )}
            {order.status === 'concluida' && order.exit_date && (
              <div className="flex flex-col items-end gap-0.5">
                <span className="text-[10px] font-semibold text-[hsl(var(--status-done))] uppercase tracking-[0.12em]">Concluído</span>
                <div className="flex items-center gap-1 text-xs text-[hsl(var(--status-done))]">
                  <Calendar className="h-3 w-3" />
                  <span className="font-medium">
                    {(() => {
                      const exitDate = toSafeDate(order.exit_date);
                      return exitDate ? format(exitDate, 'dd/MM/yy') : '';
                    })()}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
