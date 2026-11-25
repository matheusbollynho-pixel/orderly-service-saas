import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ServiceOrder } from '@/types/service-order';

// Escuta só a loja logada (antes ouvia as 15 tabelas de todas as lojas e o banco conferia
// a permissão de cada aviso para cada aparelho conectado).
export function useRealtimeSync(storeId: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!storeId) return;
    const daLoja = `store_id=eq.${storeId}`;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let fallbackInterval: ReturnType<typeof setInterval> | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let currentChannel: ReturnType<typeof supabase.channel> | null = null;

    const isHiddenQrOrder = (row: Record<string, unknown>) => {
      return row?.equipment === '__QR_WALKIN_PLACEHOLDER__' ||
        (row?.equipment === 'Avaliação de balcão' && row?.problem_description === 'Avaliação sem OS');
    };

    const updateOrdersCache = (updater: (orders: ServiceOrder[]) => ServiceOrder[]) => {
      queryClient.setQueryData(['service-orders'], (old: ServiceOrder[] | undefined) => {
        if (!old) return old;
        return updater(old);
      });
    };

    // OS (da lista em memória) que tem este item de checklist/material/pagamento
    const donoDoItem = (campo: 'checklist_items' | 'materials' | 'payments', id: unknown) => {
      if (!id) return undefined;
      const lista = queryClient.getQueryData<ServiceOrder[]>(['service-orders']) ?? [];
      return lista.find((o) => ((o[campo] as { id?: string }[] | undefined) ?? []).some((i) => i.id === id))?.id;
    };

    // Junta os avisos que chegam em sequência e atualiza cada lista uma vez só (antes um
    // segundo aviso em menos de 200ms era descartado, ex.: pagamento + caixa).
    const pendentes = new Set<string>();
    const eventosJanela = new Set<string>();
    const GRUPOS: Record<string, string[]> = {
      orders: ['service-orders', 'oficina-ativas', 'a-receber', 'contagem-os'],
      oficina: ['oficina-ativas', 'a-receber', 'contagem-os'],
      cash: ['cash-flow', 'cash-flow-summary', 'cash-flow-period', 'caixa-turno'],
      balcao: ['balcao-orders', 'a-receber'],
      agenda: ['appointments'],
      estoque: ['inventory-products', 'inventory-movements', 'cotacao'],
      boletos: ['boletos'],
      fiados: ['a-receber'],
      vales: ['vales', 'comissoes'],
      acertos: ['comissoes', 'vales'],
    };
    const invalidate = (...scopes: string[]) => {
      for (const sc of scopes) {
        if (sc === 'all') Object.keys(GRUPOS).forEach((g) => pendentes.add(g));
        else pendentes.add(sc);
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const chaves = new Set<string>();
        pendentes.forEach((g) => (GRUPOS[g] ?? []).forEach((k) => chaves.add(k)));
        // Telas que não usam o cache (ex.: Fiado) escutam este aviso
        if (pendentes.has('fiados')) eventosJanela.add('sync:fiados');
        pendentes.clear();
        chaves.forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
        eventosJanela.forEach((e) => window.dispatchEvent(new Event(e)));
        eventosJanela.clear();
      }, 300); // rápido para sync entre aparelhos
    };

    const handleServiceOrdersChange = (payload: Record<string, unknown>) => {
      const eventType = payload?.eventType;
      const row = payload?.new;
      const oldRow = payload?.old;
      // Exclusão chega de qualquer loja: só interessa se a OS está na lista desta loja
      if (eventType === 'DELETE' && !queryClient.getQueryData<ServiceOrder[]>(['service-orders'])?.some((o) => o.id === (oldRow as { id?: string } | undefined)?.id)) return;
      invalidate('oficina');

      updateOrdersCache((orders) => {
        if (eventType === 'INSERT') {
          if (!row?.id || isHiddenQrOrder(row)) return orders;
          const exists = orders.some((o) => o.id === row.id);
          if (exists) {
            return orders.map((o) => (o.id === row.id ? { ...o, ...row } as ServiceOrder : o));
          }
          return [{ ...(row as ServiceOrder), checklist_items: [], materials: [], payments: [] }, ...orders];
        }

        if (eventType === 'UPDATE') {
          if (!row?.id) return orders;
          return orders.map((o) => (o.id === row.id ? { ...o, ...row } as ServiceOrder : o));
        }

        if (eventType === 'DELETE') {
          if (!oldRow?.id) return orders;
          return orders.filter((o) => o.id !== oldRow.id);
        }

        return orders;
      });
    };

    const handleChecklistChange = (payload: Record<string, unknown>) => {
      const eventType = payload?.eventType;
      const row = payload?.new;
      const oldRow = payload?.old;
      // Exclusão chega de qualquer loja e só com o id: procura a OS dona na lista desta loja.
      const orderId = row?.order_id || oldRow?.order_id || (eventType === 'DELETE' ? donoDoItem('checklist_items', (oldRow as { id?: string } | undefined)?.id) : undefined);
      if (!orderId) return;
      invalidate('oficina');

      updateOrdersCache((orders) => {
        return orders.map((order) => {
          if (order.id !== orderId) return order;

          const checklist = order.checklist_items || [];

          if (eventType === 'INSERT') {
            const exists = checklist.some((item: Record<string, unknown>) => item.id === row.id);
            return exists
              ? ({ ...order, checklist_items: checklist.map((item: Record<string, unknown>) => (item.id === row.id ? { ...item, ...row } : item)) } as ServiceOrder)
              : ({ ...order, checklist_items: [...checklist, row] } as ServiceOrder);
          }

          if (eventType === 'UPDATE') {
            return {
              ...order,
              checklist_items: checklist.map((item: Record<string, unknown>) => (item.id === row.id ? { ...item, ...row } : item)),
            } as ServiceOrder;
          }

          if (eventType === 'DELETE') {
            return {
              ...order,
              checklist_items: checklist.filter((item: Record<string, unknown>) => item.id !== oldRow.id),
            } as ServiceOrder;
          }

          return order;
        });
      });
    };

    const handleMaterialsChange = (payload: Record<string, unknown>) => {
      const eventType = payload?.eventType;
      const row = payload?.new;
      const oldRow = payload?.old;
      // Exclusão chega de qualquer loja e só com o id: procura a OS dona na lista desta loja.
      const orderId = row?.order_id || oldRow?.order_id || (eventType === 'DELETE' ? donoDoItem('materials', (oldRow as { id?: string } | undefined)?.id) : undefined);
      if (!orderId) return;
      invalidate('oficina');

      updateOrdersCache((orders) => {
        return orders.map((order) => {
          if (order.id !== orderId) return order;

          const materials = order.materials || [];

          if (eventType === 'INSERT') {
            const exists = materials.some((item: Record<string, unknown>) => item.id === row.id);
            return exists
              ? ({ ...order, materials: materials.map((item: Record<string, unknown>) => (item.id === row.id ? { ...item, ...row } : item)) } as ServiceOrder)
              : ({ ...order, materials: [...materials, row] } as ServiceOrder);
          }

          if (eventType === 'UPDATE') {
            return {
              ...order,
              materials: materials.map((item: Record<string, unknown>) => (item.id === row.id ? { ...item, ...row } : item)),
            } as ServiceOrder;
          }

          if (eventType === 'DELETE') {
            return {
              ...order,
              materials: materials.filter((item: Record<string, unknown>) => item.id !== oldRow.id),
            } as ServiceOrder;
          }

          return order;
        });
      });
    };

    const handlePaymentsChange = (payload: Record<string, unknown>) => {
      const eventType = payload?.eventType;
      const row = payload?.new;
      const oldRow = payload?.old;
      // Exclusão chega de qualquer loja e só com o id: procura a OS dona na lista desta loja.
      const orderId = row?.order_id || oldRow?.order_id || (eventType === 'DELETE' ? donoDoItem('payments', (oldRow as { id?: string } | undefined)?.id) : undefined);
      if (!orderId) return;
      invalidate('oficina');

      updateOrdersCache((orders) => {
        return orders.map((order) => {
          if (order.id !== orderId) return order;

          const payments = order.payments || [];

          if (eventType === 'INSERT') {
            const exists = payments.some((item: Record<string, unknown>) => item.id === row.id);
            return exists
              ? ({ ...order, payments: payments.map((item: Record<string, unknown>) => (item.id === row.id ? { ...item, ...row } : item)) } as ServiceOrder)
              : ({ ...order, payments: [...payments, row] } as ServiceOrder);
          }

          if (eventType === 'UPDATE') {
            return {
              ...order,
              payments: payments.map((item: Record<string, unknown>) => (item.id === row.id ? { ...item, ...row } : item)),
            } as ServiceOrder;
          }

          if (eventType === 'DELETE') {
            return {
              ...order,
              payments: payments.filter((item: Record<string, unknown>) => item.id !== oldRow.id),
            } as ServiceOrder;
          }

          return order;
        });
      });
    };

    // Voltar pra aba recarregava a lista inteira de OS a cada troca (ex.: ir no WhatsApp e voltar).
    // O tempo real já mantém tudo em dia; aqui é só garantia, no máximo 1 vez a cada 2 minutos.
    let ultimoFoco = 0;
    const handleFocusSync = () => {
      if (Date.now() - ultimoFoco < 2 * 60 * 1000) return;
      ultimoFoco = Date.now();
      invalidate('orders');
    };
    const handleVisibilitySync = () => {
      if (document.visibilityState === 'visible') handleFocusSync();
    };

    window.addEventListener('focus', handleFocusSync);
    document.addEventListener('visibilitychange', handleVisibilitySync);

    // Reserva caso o tempo real caia. Era a cada 15s em toda aba (até escondida) e
    // recarregava a lista inteira de OS: virou o maior consumo do banco. Agora 5 min e só com a tela à vista.
    fallbackInterval = setInterval(() => {
      if (navigator.onLine && document.visibilityState === 'visible') {
        invalidate('all');
      }
    }, 5 * 60 * 1000);

    const subscribe = () => {
      if (currentChannel) {
        supabase.removeChannel(currentChannel);
      }

      // Inclusão/alteração: só da loja. Exclusão: sem filtro (o Supabase não filtra DELETE por coluna).
      const tabelas: [string, (payload: Record<string, unknown>) => void][] = [
        ['service_orders', (payload) => handleServiceOrdersChange(payload)],
        ['checklist_items', (payload) => handleChecklistChange(payload)],
        ['materials', (payload) => handleMaterialsChange(payload)],
        ['payments', (payload) => handlePaymentsChange(payload)],
        ['cash_flow', () => invalidate('cash')],
        ['balcao_orders', () => invalidate('balcao')],
        ['balcao_items', () => invalidate('balcao')],
        ['appointments', () => invalidate('agenda')],
        ['inventory_products', () => invalidate('estoque')],
        ['inventory_movements', () => invalidate('estoque')],
        ['boletos', () => invalidate('boletos')],
        ['fiados', () => invalidate('fiados')],
        ['fiado_payments', () => invalidate('fiados')],
        ['vales', () => invalidate('vales')],
        ['acertos', () => invalidate('acertos')],
        ['caixa_turnos', () => invalidate('cash')],
      ];
      let canal = supabase.channel(`global-realtime-sync-${storeId}-${Date.now()}`);
      for (const [table, aoMudar] of tabelas) {
        canal = canal
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table, filter: daLoja }, aoMudar)
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table, filter: daLoja }, aoMudar)
          .on('postgres_changes', { event: 'DELETE', schema: 'public', table }, aoMudar);
      }
      currentChannel = canal
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            invalidate('all');
            // Reconecta automaticamente após 3s
            if (reconnectTimeout) clearTimeout(reconnectTimeout);
            reconnectTimeout = setTimeout(() => {
              if (navigator.onLine) subscribe();
            }, 3000);
          }
        });
    };

    subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      if (fallbackInterval) clearInterval(fallbackInterval);
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      window.removeEventListener('focus', handleFocusSync);
      document.removeEventListener('visibilitychange', handleVisibilitySync);
      if (currentChannel) supabase.removeChannel(currentChannel);
    };
  }, [queryClient, storeId]);
}
