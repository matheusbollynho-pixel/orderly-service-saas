import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface PaymentEntry {
  method: string;
  amount: number;
}

export interface BalcaoOrder {
  id: string;
  numero: number;
  client_name: string | null;
  client_cpf: string | null;
  client_phone: string | null;
  client_address: string | null;
  status: 'aberta' | 'finalizada' | 'cancelada';
  payment_method: string | null;
  payment_methods: PaymentEntry[] | null;
  discount_pct: number;
  subtotal: number;
  discount_amount: number;
  total: number;
  notes: string | null;
  finalized_at: string | null;
  created_at: string;
  updated_at: string;
  balcao_items?: BalcaoItem[];
}

export interface BalcaoItem {
  id: string;
  order_id: string;
  type: 'estoque' | 'avulso';
  product_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  created_at: string;
}

const toISODate = () =>
  new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Fortaleza' }).split('/').reverse().join('-');

export function useBalcao() {
  const queryClient = useQueryClient();

  // ── Lista de notas ────────────────────────────────────────────
  const ordersQuery = useQuery({
    queryKey: ['balcao-orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('balcao_orders')
        .select('*, balcao_items(*)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as BalcaoOrder[];
    },
    refetchInterval: 10000,
    staleTime: 5000,
  });

  // ── Criar nova nota ───────────────────────────────────────────
  const createOrderMutation = useMutation({
    mutationFn: async (clientName?: string) => {
      const { data, error } = await supabase
        .from('balcao_orders')
        .insert({ client_name: clientName || null })
        .select()
        .single();
      if (error) throw error;
      return data as BalcaoOrder;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['balcao-orders'] });
    },
    onError: (e: Error) => toast.error(`Erro ao criar nota: ${e.message}`),
  });

  // ── Atualizar nota (client, payment, discount, totals) ────────
  const updateOrderMutation = useMutation({
    mutationFn: async (updates: Partial<BalcaoOrder> & { id: string }) => {
      const { id, ...rest } = updates;
      const { data, error } = await supabase
        .from('balcao_orders')
        .update({ ...rest, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as BalcaoOrder;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['balcao-orders'] });
    },
    onError: (e: Error) => toast.error(`Erro ao atualizar nota: ${e.message}`),
  });

  // ── Adicionar item ────────────────────────────────────────────
  const addItemMutation = useMutation({
    mutationFn: async (item: Omit<BalcaoItem, 'id' | 'created_at'>) => {
      const { data, error } = await supabase
        .from('balcao_items')
        .insert({
          order_id: item.order_id,
          type: item.type,
          product_id: item.product_id ?? null,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_price: item.unit_price * item.quantity,
        })
        .select()
        .single();
      if (error) throw error;
      return data as BalcaoItem;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['balcao-orders'] });
    },
    onError: (e: Error) => toast.error(`Erro ao adicionar item: ${e.message}`),
  });

  // ── Atualizar item ────────────────────────────────────────────
  const updateItemMutation = useMutation({
    mutationFn: async (updates: Partial<BalcaoItem> & { id: string }) => {
      const { id, ...rest } = updates;
      if (rest.unit_price !== undefined || rest.quantity !== undefined) {
        // Recalcular total_price
        const { data: current } = await supabase
          .from('balcao_items')
          .select('unit_price, quantity')
          .eq('id', id)
          .single();
        const qty = rest.quantity ?? current?.quantity ?? 1;
        const price = rest.unit_price ?? current?.unit_price ?? 0;
        rest.total_price = qty * price;
      }
      const { data, error } = await supabase
        .from('balcao_items')
        .update(rest)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as BalcaoItem;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['balcao-orders'] });
    },
    onError: (e: Error) => toast.error(`Erro ao atualizar item: ${e.message}`),
  });

  // ── Remover item ──────────────────────────────────────────────
  const removeItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase.from('balcao_items').delete().eq('id', itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['balcao-orders'] });
    },
    onError: (e: Error) => toast.error(`Erro ao remover item: ${e.message}`),
  });

  // ── Finalizar nota (admin) ────────────────────────────────────
  const finalizeOrderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      // Buscar nota com itens
      const { data: order, error: fetchErr } = await supabase
        .from('balcao_orders')
        .select('*, balcao_items(*)')
        .eq('id', orderId)
        .single();
      if (fetchErr) throw fetchErr;
      if (order.status !== 'aberta') throw new Error('Nota não está aberta');

      // Criar movimentações de estoque para itens do tipo estoque
      let firstMovId: string | null = null;
      for (const item of (order.balcao_items ?? []) as BalcaoItem[]) {
        if (item.type === 'estoque' && item.product_id) {
          const { data: mov, error: movErr } = await supabase
            .from('inventory_movements')
            .insert({
              product_id: item.product_id,
              type: 'saida_balcao',
              quantity: item.quantity,
              unit_price: item.unit_price,
              notes: `Nota Balcão #${orderId.slice(0, 8)}${order.client_name ? ` - ${order.client_name}` : ''}`,
              balcao_order_id: orderId,
            })
            .select()
            .single();
          if (movErr) throw movErr;
          if (!firstMovId) firstMovId = mov.id;
        }
      }

      // Lançar no caixa — uma entrada por forma de pagamento
      const itemsSummary = (order.balcao_items as BalcaoItem[])
        .map(i => `${i.quantity}x ${i.description}`).join(', ');
      const description = `Nota Balcão${order.client_name ? ` - ${order.client_name}` : ''}: ${itemsSummary}`;

      const payments: PaymentEntry[] =
        Array.isArray(order.payment_methods) && order.payment_methods.length > 0
          ? order.payment_methods
          : [{ method: order.payment_method ?? 'dinheiro', amount: order.total }];

      const discountNotes = order.discount_pct > 0
        ? `Desconto ${order.discount_pct}% = R$ ${order.discount_amount.toFixed(2)}`
        : null;

      for (let i = 0; i < payments.length; i++) {
        const pm = payments[i];
        const { error: cfErr } = await supabase.from('cash_flow').insert({
          type: 'entrada',
          amount: pm.amount,
          description,
          category: 'venda_balcao',
          payment_method: pm.method,
          date: toISODate(),
          notes: discountNotes,
          inventory_movement_id: i === 0 ? firstMovId : null,
          balcao_order_id: orderId,
        });
        if (cfErr) throw cfErr;
      }

      // Atualizar status
      const { error: updErr } = await supabase
        .from('balcao_orders')
        .update({ status: 'finalizada', finalized_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', orderId);
      if (updErr) throw updErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['balcao-orders'] });
      queryClient.invalidateQueries({ queryKey: ['cash-flow'] });
      queryClient.invalidateQueries({ queryKey: ['cash-flow-summary'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-products'] });
      toast.success('Nota finalizada! Caixa e estoque atualizados.');
    },
    onError: (e: Error) => toast.error(`Erro ao finalizar: ${e.message}`),
  });

  // ── Cancelar nota (admin) ─────────────────────────────────────
  const cancelOrderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const { data: order, error: fetchErr } = await supabase
        .from('balcao_orders')
        .select('*, balcao_items(*)')
        .eq('id', orderId)
        .single();
      if (fetchErr) throw fetchErr;
      if (order.status === 'cancelada') throw new Error('Nota já cancelada');

      if (order.status === 'finalizada') {
        // Reverter movimentações de estoque
        for (const item of (order.balcao_items ?? []) as BalcaoItem[]) {
          if (item.type === 'estoque' && item.product_id) {
            const { error: movErr } = await supabase
              .from('inventory_movements')
              .insert({
                product_id: item.product_id,
                type: 'devolucao',
                quantity: item.quantity,
                unit_price: item.unit_price,
                notes: `Cancelamento Nota Balcão #${orderId.slice(0, 8)}`,
              });
            if (movErr) throw movErr;
          }
        }

        // Remover lançamento do caixa
        await supabase.from('cash_flow').delete().eq('balcao_order_id', orderId);
      }

      // Marcar como cancelada
      const { error: updErr } = await supabase
        .from('balcao_orders')
        .update({ status: 'cancelada', updated_at: new Date().toISOString() })
        .eq('id', orderId);
      if (updErr) throw updErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['balcao-orders'] });
      queryClient.invalidateQueries({ queryKey: ['cash-flow'] });
      queryClient.invalidateQueries({ queryKey: ['cash-flow-summary'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-products'] });
      toast.success('Nota cancelada.');
    },
    onError: (e: Error) => toast.error(`Erro ao cancelar: ${e.message}`),
  });

  return {
    orders: ordersQuery.data ?? [],
    isLoading: ordersQuery.isLoading,

    createOrder: createOrderMutation.mutateAsync,
    isCreating: createOrderMutation.isPending,

    updateOrder: updateOrderMutation.mutateAsync,

    addItem: addItemMutation.mutateAsync,
    updateItem: updateItemMutation.mutateAsync,
    removeItem: removeItemMutation.mutateAsync,

    finalizeOrder: finalizeOrderMutation.mutateAsync,
    isFinalizing: finalizeOrderMutation.isPending,

    cancelOrder: cancelOrderMutation.mutateAsync,
    isCancelling: cancelOrderMutation.isPending,
  };
}
