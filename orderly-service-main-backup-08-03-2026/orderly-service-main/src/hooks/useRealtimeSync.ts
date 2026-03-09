import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ServiceOrder } from '@/types/service-order';

export function useRealtimeSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let fallbackInterval: ReturnType<typeof setInterval> | null = null;
    let lastInvalidateAt = 0;

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

    const invalidate = (scope: 'orders' | 'cash' | 'all') => {
      const now = Date.now();
      if (now - lastInvalidateAt < 1000) return;
      lastInvalidateAt = now;

      if (timer) clearTimeout(timer);

      timer = setTimeout(() => {
        if (scope === 'orders' || scope === 'all') {
          queryClient.invalidateQueries({ queryKey: ['service-orders'] });
        }

        if (scope === 'cash' || scope === 'all') {
          queryClient.invalidateQueries({ queryKey: ['cash-flow'] });
          queryClient.invalidateQueries({ queryKey: ['cash-flow-summary'] });
          queryClient.invalidateQueries({ queryKey: ['cash-flow-period'] });
        }
      }, 300); // 300ms - rápido para sync entre dispositivos
    };

    const handleServiceOrdersChange = (payload: Record<string, unknown>) => {
      const eventType = payload?.eventType;
      const row = payload?.new;
      const oldRow = payload?.old;

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
      const orderId = row?.order_id || oldRow?.order_id;
      if (!orderId) return;

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
      const orderId = row?.order_id || oldRow?.order_id;
      if (!orderId) return;

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
      const orderId = row?.order_id || oldRow?.order_id;
      if (!orderId) return;

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

    const handleFocusSync = () => invalidate('orders');
    const handleVisibilitySync = () => {
      if (document.visibilityState === 'visible') {
        invalidate('orders');
      }
    };

    window.addEventListener('focus', handleFocusSync);
    document.addEventListener('visibilitychange', handleVisibilitySync);

    // Fallback para cenários em que websocket/realtime está instável
    fallbackInterval = setInterval(() => {
      if (navigator.onLine) {
        invalidate('orders');
      }
    }, 60000);

    const channel = supabase
      .channel('global-realtime-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_orders' }, (payload) => handleServiceOrdersChange(payload))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checklist_items' }, (payload) => handleChecklistChange(payload))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'materials' }, (payload) => handleMaterialsChange(payload))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, (payload) => handlePaymentsChange(payload))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_flow' }, () => invalidate('cash'))
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          invalidate('orders');
        }
      });

    return () => {
      if (timer) clearTimeout(timer);
      if (fallbackInterval) clearInterval(fallbackInterval);
      window.removeEventListener('focus', handleFocusSync);
      document.removeEventListener('visibilitychange', handleVisibilitySync);
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
