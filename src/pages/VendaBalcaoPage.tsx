import { useState } from 'react';
import { useBalcao, type BalcaoOrder } from '@/hooks/useBalcao';
import { BalcaoNotaDetail } from '@/components/BalcaoNotaDetail';
import { useAuth } from '@/hooks/useAuth';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Search, ShoppingCart, Clock, CheckCircle, XCircle } from 'lucide-react';

const STATUS_LABELS: Record<string, string> = {
  aberta: 'Aberta',
  finalizada: 'Finalizada',
  cancelada: 'Cancelada',
};

const STATUS_COLORS: Record<string, string> = {
  aberta: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  finalizada: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  cancelada: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

const STATUS_ICONS = {
  aberta: Clock,
  finalizada: CheckCircle,
  cancelada: XCircle,
};

type Filter = 'todas' | 'aberta' | 'finalizada' | 'cancelada';

export default function VendaBalcaoPage() {
  const { orders, isLoading, createOrder, isCreating } = useBalcao();
  const { isAdmin } = useAuth();

  const [selectedOrder, setSelectedOrder] = useState<BalcaoOrder | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('aberta');

  // Sincronizar selectedOrder com dados atualizados do servidor
  const currentOrder = selectedOrder
    ? orders.find(o => o.id === selectedOrder.id) ?? selectedOrder
    : null;

  const filtered = orders.filter(o => {
    if (filter !== 'todas' && o.status !== filter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        o.client_name?.toLowerCase().includes(q) ||
        o.id.toLowerCase().includes(q) ||
        String(o.numero ?? '').includes(q)
      );
    }
    return true;
  });

  const handleNovaNote = async () => {
    const order = await createOrder();
    setSelectedOrder(order);
  };

  if (currentOrder) {
    return (
      <BalcaoNotaDetail
        order={currentOrder}
        isAdmin={!!isAdmin}
        onBack={() => setSelectedOrder(null)}
      />
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Notas de Balcão</h2>
        </div>
        <Button type="button" onClick={handleNovaNote} disabled={isCreating} className="gap-1.5 h-9">
          <Plus className="h-4 w-4" />
          Nova Nota
        </Button>
      </div>

      {/* ── Filtros ── */}
      <div className="flex gap-2 flex-wrap">
        {(['aberta', 'finalizada', 'cancelada', 'todas'] as Filter[]).map(f => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
              filter === f
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {f === 'todas' ? 'Todas' : STATUS_LABELS[f]}
            <span className="ml-1 opacity-70">
              ({orders.filter(o => f === 'todas' || o.status === f).length})
            </span>
          </button>
        ))}
      </div>

      {/* ── Busca ── */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          className="pl-10 h-10"
          placeholder="Buscar por cliente ou número da nota..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* ── Lista ── */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <ShoppingCart className="h-12 w-12 mx-auto mb-3 opacity-20" />
          <p className="text-sm">
            {filter === 'aberta' ? 'Nenhuma nota aberta — crie uma nova' : 'Nenhuma nota encontrada'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(order => {
            const Icon = STATUS_ICONS[order.status] ?? Clock;
            const itemCount = order.balcao_items?.length ?? 0;
            return (
              <button
                key={order.id}
                type="button"
                onClick={() => setSelectedOrder(order)}
                className="w-full text-left border rounded-xl px-4 py-3 hover:bg-muted/40 transition-colors bg-card"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">
                        {order.client_name || 'Cliente não informado'}
                      </span>
                      <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[order.status]}`}>
                        <Icon className="h-2.5 w-2.5" />
                        {STATUS_LABELS[order.status]}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      #{String(order.numero ?? '').padStart(4, '0')} · {new Date(order.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {itemCount} {itemCount === 1 ? 'item' : 'itens'}
                      {order.discount_pct > 0 && ` · Desconto ${order.discount_pct}%`}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-bold text-base">R$ {order.total.toFixed(2)}</p>
                    {order.status === 'finalizada' && order.finalized_at && (
                      <p className="text-[10px] text-muted-foreground">
                        Finalizada {new Date(order.finalized_at).toLocaleDateString('pt-BR')}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
