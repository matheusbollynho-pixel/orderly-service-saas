import { useMemo, useState } from 'react';
import { ServiceOrder, StatusOficina, STATUS_OFICINA_LABELS, STATUS_OFICINA_COLORS, STATUS_OFICINA_OPTIONS_LIST } from '@/types/service-order';
import { useMechanics } from '@/hooks/useMechanics';
import { differenceInDays, parseISO, isToday, isPast, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertTriangle, Clock, Wrench, Calendar, User } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface QuadroOficinaPageProps {
  orders: ServiceOrder[];
  onSelectOrder: (order: ServiceOrder) => void;
  onUpdateOrder?: (data: Partial<ServiceOrder> & { id: string }) => void;
}

type UrgencyLevel = 'atrasada' | 'hoje' | 'ok' | 'sem_previsao';

function getUrgency(previsao: string | null | undefined): UrgencyLevel {
  if (!previsao) return 'sem_previsao';
  const date = parseISO(previsao);
  if (isPast(date) && !isToday(date)) return 'atrasada';
  if (isToday(date)) return 'hoje';
  return 'ok';
}

const URGENCY_CONFIG: Record<UrgencyLevel, { label: string; bar: string; badge: string; icon?: React.ReactNode }> = {
  atrasada: {
    label: 'Atrasada',
    bar: 'bg-red-500',
    badge: 'bg-red-500/20 text-red-400 border border-red-500/40',
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
  },
  hoje: {
    label: 'Entrega hoje',
    bar: 'bg-yellow-400',
    badge: 'bg-yellow-400/20 text-yellow-400 border border-yellow-400/40',
    icon: <Clock className="h-3.5 w-3.5" />,
  },
  ok: {
    label: '',
    bar: 'bg-green-500',
    badge: 'bg-green-500/20 text-green-400 border border-green-500/40',
  },
  sem_previsao: {
    label: 'Sem previsão',
    bar: 'bg-muted',
    badge: 'bg-muted/40 text-muted-foreground border border-border',
  },
};


function WorkshopCard({
  order,
  onSelect,
  onStatusChange,
}: {
  order: ServiceOrder;
  onSelect: () => void;
  onStatusChange: (status: StatusOficina) => void;
}) {
  const { mechanics } = useMechanics();
  const mechanic = mechanics.find(m => m.id === order.mechanic_id);

  const urgency = getUrgency(order.previsao_entrega);
  const urgencyConfig = URGENCY_CONFIG[urgency];

  const daysInShop = order.entry_date
    ? differenceInDays(new Date(), parseISO(order.entry_date))
    : null;

  const statusOficinaLabel = order.status_oficina
    ? STATUS_OFICINA_LABELS[order.status_oficina]
    : null;
  const statusOficinaColor = order.status_oficina
    ? STATUS_OFICINA_COLORS[order.status_oficina]
    : 'bg-muted/40 text-muted-foreground border-border';

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Barra de urgência no topo */}
      <div className={`h-1.5 w-full ${urgencyConfig.bar}`} />

      <div className="p-4">
        {/* Cabeçalho: cliente + badges */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex-1 min-w-0">
            <button
              type="button"
              onClick={onSelect}
              className="text-left hover:text-primary transition-colors"
            >
              <h3 className="font-bold text-base truncate leading-tight">{order.client_name}</h3>
              <p className="text-sm text-muted-foreground truncate mt-0.5">{order.equipment}</p>
            </button>
          </div>
          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
            {/* Badge de urgência */}
            {(urgency === 'atrasada' || urgency === 'hoje') && (
              <span className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${urgencyConfig.badge}`}>
                {urgencyConfig.icon}
                {urgencyConfig.label}
              </span>
            )}
            {/* Badge de status da oficina */}
            {statusOficinaLabel && (
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${statusOficinaColor}`}>
                {statusOficinaLabel}
              </span>
            )}
          </div>
        </div>

        {/* Informações de tempo */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
          {daysInShop !== null && (
            <div className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              <span>
                {daysInShop === 0
                  ? 'Entrou hoje'
                  : daysInShop === 1
                  ? '1 dia na oficina'
                  : `${daysInShop} dias na oficina`}
              </span>
            </div>
          )}
          {order.previsao_entrega && (
            <div className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              <span>
                Previsão:{' '}
                {format(parseISO(order.previsao_entrega), "dd/MM", { locale: ptBR })}
              </span>
            </div>
          )}
        </div>

        {/* Mecânico */}
        {mechanic && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
            <User className="h-3.5 w-3.5" />
            <span>{mechanic.name}</span>
          </div>
        )}

        {/* Select de status da oficina */}
        <div onClick={e => e.stopPropagation()}>
          <Select
            value={order.status_oficina ?? ''}
            onValueChange={v => onStatusChange(v as StatusOficina)}
          >
            <SelectTrigger className="h-8 text-xs bg-muted/30 border-border/60">
              <div className="flex items-center gap-1.5">
                <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
                <SelectValue placeholder="Definir status da oficina..." />
              </div>
            </SelectTrigger>
            <SelectContent>
              {STATUS_OFICINA_OPTIONS_LIST.map(opt => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

export default function QuadroOficinaPage({
  orders,
  onSelectOrder,
  onUpdateOrder,
}: QuadroOficinaPageProps) {
  const [statusFilter, setStatusFilter] = useState<StatusOficina | 'todos'>('todos');

  // Apenas OS que ainda não foram entregues
  const activeOrders = useMemo(
    () => orders.filter(o => o.status !== 'concluida_entregue'),
    [orders]
  );

  // Ordenar: atrasadas → hoje → sem previsão → por previsão crescente
  const sorted = useMemo(() => {
    return [...activeOrders].sort((a, b) => {
      const ua = getUrgency(a.previsao_entrega);
      const ub = getUrgency(b.previsao_entrega);
      const order: UrgencyLevel[] = ['atrasada', 'hoje', 'sem_previsao', 'ok'];
      const ia = order.indexOf(ua);
      const ib = order.indexOf(ub);
      if (ia !== ib) return ia - ib;
      // dentro do mesmo grupo, mais antigo na oficina primeiro
      if (a.entry_date && b.entry_date) {
        return a.entry_date < b.entry_date ? -1 : 1;
      }
      return 0;
    });
  }, [activeOrders]);

  // Contadores por urgência
  const counts = useMemo(() => {
    return {
      atrasada: sorted.filter(o => getUrgency(o.previsao_entrega) === 'atrasada').length,
      hoje: sorted.filter(o => getUrgency(o.previsao_entrega) === 'hoje').length,
      sem_previsao: sorted.filter(o => getUrgency(o.previsao_entrega) === 'sem_previsao').length,
      total: sorted.length,
    };
  }, [sorted]);

  const filtered = useMemo(() => {
    if (statusFilter === 'todos') return sorted;
    return sorted.filter(o => o.status_oficina === statusFilter);
  }, [sorted, statusFilter]);

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const opt of STATUS_OFICINA_OPTIONS_LIST) {
      c[opt.value] = sorted.filter(o => o.status_oficina === opt.value).length;
    }
    return c;
  }, [sorted]);

  const handleStatusChange = (orderId: string, status: StatusOficina) => {
    onUpdateOrder?.({ id: orderId, status_oficina: status });
  };

  return (
    <div className="pb-32">
      {/* Header com resumo */}
      <div className="px-4 pt-4 pb-3">
        <h1 className="text-xl font-bold mb-3">Quadro da Oficina</h1>

        <div className="grid grid-cols-4 gap-2">
          <div className="rounded-lg bg-card border border-border p-2.5 text-center">
            <p className="text-2xl font-bold">{counts.total}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">Total</p>
          </div>
          <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-2.5 text-center">
            <p className="text-2xl font-bold text-red-400">{counts.atrasada}</p>
            <p className="text-[10px] text-red-400/80 uppercase tracking-wide mt-0.5">Atrasadas</p>
          </div>
          <div className="rounded-lg bg-yellow-400/10 border border-yellow-400/30 p-2.5 text-center">
            <p className="text-2xl font-bold text-yellow-400">{counts.hoje}</p>
            <p className="text-[10px] text-yellow-400/80 uppercase tracking-wide mt-0.5">Hoje</p>
          </div>
          <div className="rounded-lg bg-muted/30 border border-border p-2.5 text-center">
            <p className="text-2xl font-bold text-muted-foreground">{counts.sem_previsao}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">Sem prev.</p>
          </div>
        </div>
      </div>

      {/* Filtros por status da oficina */}
      <div className="px-4 pb-3">
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button
            type="button"
            onClick={() => setStatusFilter('todos')}
            className={`flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
              statusFilter === 'todos'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-muted/30 text-muted-foreground border-border hover:border-primary/50'
            }`}
          >
            Todos · {sorted.length}
          </button>
          {STATUS_OFICINA_OPTIONS_LIST.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setStatusFilter(opt.value as StatusOficina)}
              className={`flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                statusFilter === opt.value
                  ? `${STATUS_OFICINA_COLORS[opt.value]} border-current`
                  : 'bg-muted/30 text-muted-foreground border-border hover:border-primary/50'
              }`}
            >
              {STATUS_OFICINA_LABELS[opt.value]} · {statusCounts[opt.value] ?? 0}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      <div className="px-4 space-y-3">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Wrench className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">
              {sorted.length === 0 ? 'Nenhuma moto na oficina' : 'Nenhuma moto neste status'}
            </p>
            <p className="text-sm mt-1">
              {sorted.length === 0 ? 'As OS abertas aparecerão aqui' : 'Tente outro filtro'}
            </p>
          </div>
        ) : (
          filtered.map(order => (
            <WorkshopCard
              key={order.id}
              order={order}
              onSelect={() => onSelectOrder(order)}
              onStatusChange={status => handleStatusChange(order.id, status)}
            />
          ))
        )}
      </div>
    </div>
  );
}
