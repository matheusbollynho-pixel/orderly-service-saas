import { ServiceOrder } from '@/types/service-order';
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

  return (
    <Card 
      className="card-elevated cursor-pointer transition-all hover:shadow-elevated active:scale-[0.99] animate-slide-up"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="font-semibold text-foreground truncate">{order.client_name}</h3>
              <StatusBadge status={order.status} />
            </div>
            
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Wrench className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate">{order.equipment}</span>
              </div>
              
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate">{order.client_address}</span>
              </div>
              
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Phone className="h-3.5 w-3.5 flex-shrink-0" />
                <span>{order.client_phone}</span>
              </div>
            </div>

            {totalItems > 0 && (
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Progresso</span>
                  <span className="font-medium text-foreground">{completedItems}/{totalItems}</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground mt-3">
              {formatDistanceToNow(new Date(order.created_at), { 
                addSuffix: true, 
                locale: ptBR 
              })}
            </p>
          </div>
          
          <div className="flex flex-col items-end gap-2">
            <ChevronRight className="h-5 w-5 text-muted-foreground mt-1" />
            {order.entry_date && (
              <div className="flex flex-col items-end gap-0.5">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Entrada</span>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  <span>{format(new Date(order.entry_date + 'T00:00:00'), 'dd/MM/yy')}</span>
                </div>
              </div>
            )}
            {order.status === 'concluida' && order.exit_date && (
              <div className="flex flex-col items-end gap-0.5">
                <span className="text-[10px] font-medium text-[hsl(var(--status-done))] uppercase tracking-wide">Concluído</span>
                <div className="flex items-center gap-1 text-xs text-[hsl(var(--status-done))]">
                  <Calendar className="h-3 w-3" />
                  <span className="font-medium">{format(new Date(order.exit_date + 'T00:00:00'), 'dd/MM/yy')}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
