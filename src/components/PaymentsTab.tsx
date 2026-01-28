import { useMemo, useState } from 'react';
import { ServiceOrder, PaymentMethod } from '@/types/service-order';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Trash2, Plus } from 'lucide-react';

interface PaymentsTabProps {
  orders: ServiceOrder[];
  isLoading?: boolean;
  period: 'week' | 'month';
  onPeriodChange: (p: 'week' | 'month') => void;
  onAddPayment: (payload: { order_id: string; amount: number; method: PaymentMethod; reference?: string | null; notes?: string | null }) => void;
  onDeletePayment: (id: string) => void;
}

export function PaymentsTab({ orders, isLoading, period, onPeriodChange, onAddPayment, onDeletePayment }: PaymentsTabProps) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'completed_unpaid'>('all');
  const [adding, setAdding] = useState<Record<string, { amount: string; method: PaymentMethod; notes?: string }>>({});

  const sanitizeMoney = (value: string) => {
    // Apenas remover caracteres que não são números ou ponto/vírgula
    return value.replace(/[^0-9.,]/g, '').replace(',', '.');
  };

  const startOfWeek = () => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const date = new Date(d.setDate(diff));
    date.setHours(0, 0, 0, 0);
    return date;
  };
  const startOfMonth = () => {
    const date = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    date.setHours(0, 0, 0, 0);
    return date;
  };
  const rangeStart = period === 'week' ? startOfWeek() : startOfMonth();

  const filteredOrders = useMemo(() => {
    const q = query.trim().toLowerCase();
    
    // Manter todas as ordens, mas marcar quais pagamentos estão no período
    const ordersWithPaymentInfo = orders.map(o => {
      const paymentsInRange = (o.payments || []).filter(
        p => new Date(p.created_at) >= rangeStart
      );
      return { 
        ...o, 
        _paymentsInRange: paymentsInRange,
        _hasPaymentsInRange: paymentsInRange.length > 0 
      };
    });

    const list = ordersWithPaymentInfo
      .map(o => {
        const totalOS = (o.materials || []).reduce((acc, m) => acc + ((m.valor || 0) * (parseFloat(m.quantidade) || 0)), 0);
        // Soma TODOS os pagamentos (não apenas os do período)
        const totalPaid = (o.payments || []).reduce((acc, p) => acc + (p.amount || 0), 0);
        const pending = Math.max(totalOS - totalPaid, 0);
        return { ...o, _totalOS: totalOS, _totalPaid: totalPaid, _pending: pending } as any;
      })
      // Aplica filtro de status
      .filter(o => {
        if (statusFilter === 'pending') {
          return o._pending > 0;
        }
        if (statusFilter === 'completed_unpaid') {
          return o.status === 'concluida' && o._pending > 0;
        }
        return true; // 'all'
      })
      // Ordena colocando primeiro as ordens que têm pagamentos no período, depois por data
      .sort((a, b) => {
        // Se uma tem pagamento no período e a outra não, coloca a com pagamento primeiro
        if (a._hasPaymentsInRange && !b._hasPaymentsInRange) return -1;
        if (!a._hasPaymentsInRange && b._hasPaymentsInRange) return 1;
        // Depois ordena por data da ordem
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

    if (!q) return list;
    return list.filter(o =>
      o.client_name.toLowerCase().includes(q) ||
      o.equipment.toLowerCase().includes(q)
    );
  }, [orders, query, rangeStart, statusFilter]);

  const methodLabels: Record<PaymentMethod, string> = {
    dinheiro: 'DIN',
    pix: 'PIX',
    cartao: 'CAR',
  };

  const methods: PaymentMethod[] = ['dinheiro','pix','cartao'];

  const methodTotals = useMemo(() => {
    const acc: Record<PaymentMethod, { amount: number; count: number }> = {
      dinheiro: { amount: 0, count: 0 },
      pix: { amount: 0, count: 0 },
      cartao: { amount: 0, count: 0 },
    };
    // Somar TODOS os pagamentos (não apenas os do período)
    filteredOrders.forEach((o: any) => {
      (o.payments || []).forEach((p: any) => {
        const method = (p.method || 'outro') as PaymentMethod;
        const amount = Number(p.amount || 0);
        if (!acc[method]) return;
        acc[method].amount += amount;
        acc[method].count += 1;
      });
    });
    return acc;
  }, [filteredOrders]);

  const handleAdd = (orderId: string) => {
    const state = adding[orderId];
    const amount = parseFloat(state?.amount || '');
    const method = state?.method;
    if (!amount || amount <= 0 || !method) return;
    onAddPayment({ order_id: orderId, amount, method, notes: state?.notes || null });
    setAdding(prev => ({ ...prev, [orderId]: { amount: '', method, notes: state?.notes } }));
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <Input
          placeholder="Buscar cliente ou moto..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-10"
        />
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
          <SelectTrigger className="w-full h-10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="pending">Com pendência</SelectItem>
            <SelectItem value="completed_unpaid">Concluídas não pagas</SelectItem>
          </SelectContent>
        </Select>
        <Select value={period} onValueChange={(v) => onPeriodChange(v as any)}>
          <SelectTrigger className="w-full h-10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="week">Semana atual</SelectItem>
            <SelectItem value="month">Mês atual</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {methods.map((m) => (
          <Card key={m}>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">{methodLabels[m]}</p>
              <p className="text-sm font-semibold">R$ {methodTotals[m].amount.toFixed(2)}</p>
              <p className="text-[11px] text-muted-foreground">{methodTotals[m].count} pagamento(s)</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {isLoading ? (
        <p>Carregando...</p>
      ) : filteredOrders.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sem ordens no período.</p>
      ) : (
        <div className="space-y-3">
          {filteredOrders.map((o: any) => (
            <Card key={o.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">OS: {new Date(o.created_at).toLocaleDateString('pt-BR')}</p>
                    {o._paymentsInRange && o._paymentsInRange.length > 0 && (
                      <p className="text-xs text-muted-foreground">Último pgto: {new Date(Math.max(...o._paymentsInRange.map((p: any) => new Date(p.created_at).getTime()))).toLocaleDateString('pt-BR')}</p>
                    )}
                    <p className="font-medium">{o.client_name}</p>
                    <p className="text-sm text-muted-foreground">{o.equipment}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm">Total OS</p>
                    <p className="font-semibold">R$ {o._totalOS.toFixed(2)}</p>
                    <p className="text-sm mt-1">Pago</p>
                    <p className="font-semibold text-emerald-600">R$ {o._totalPaid.toFixed(2)}</p>
                    <p className="text-sm mt-1">Pendente</p>
                    <p className={`font-semibold ${o._pending > 0 ? 'text-amber-600' : 'text-muted-foreground'}`}>R$ {o._pending.toFixed(2)}</p>
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <p className="text-sm font-medium">Pagamentos</p>
                  {(o.payments || []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum pagamento registrado.</p>
                  ) : (
                    <div className="space-y-2">
                      {o.payments.map((p: any) => {
                        const isInPeriod = new Date(p.created_at) >= rangeStart;
                        return (
                          <div key={p.id} className={`flex items-center justify-between text-sm ${!isInPeriod ? 'opacity-60' : ''}`}>
                            <div>
                              <p className="text-xs text-muted-foreground">
                                {new Date(p.created_at).toLocaleDateString('pt-BR')}
                                {!isInPeriod && ' (fora do período)'}
                              </p>
                              <p className="font-medium">R$ {Number(p.amount || 0).toFixed(2)} <span className="text-muted-foreground">• {p.method}</span></p>
                              {p.reference ? <p className="text-xs text-muted-foreground">Ref: {p.reference}</p> : null}
                              {p.notes ? <p className="text-xs text-muted-foreground">Obs: {p.notes}</p> : null}
                            </div>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => onDeletePayment(p.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-6 gap-2">
                  <Input
                    placeholder="Valor"
                    value={adding[o.id]?.amount || ''}
                    onChange={(e) => setAdding(prev => {
                      const amount = sanitizeMoney(e.target.value);
                      return { ...prev, [o.id]: { ...(prev[o.id] || { method: 'dinheiro' }), amount } };
                    })}
                    className="h-9 sm:col-span-2"
                    type="number"
                    min="0"
                  />
                  <Select
                    value={adding[o.id]?.method || 'dinheiro'}
                    onValueChange={(v) => setAdding(prev => ({ ...prev, [o.id]: { ...(prev[o.id] || { amount: '' }), method: v as PaymentMethod } }))}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Forma" />
                    </SelectTrigger>
                    <SelectContent>
                      {methods.map(m => (
                        <SelectItem key={m} value={m}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="Obs. (opcional)"
                    value={adding[o.id]?.notes || ''}
                    onChange={(e) => setAdding(prev => ({ ...prev, [o.id]: { ...(prev[o.id] || { amount: '', method: 'dinheiro' }), notes: e.target.value } }))}
                    className="h-9 sm:col-span-2"
                  />
                  <Button className="h-9" onClick={() => handleAdd(o.id)}>
                    <Plus className="h-4 w-4 mr-1" /> Adicionar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
