import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useRealtimeSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const invalidate = (scope: 'orders' | 'cash' | 'all') => {
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
      }, 250);
    };

    const channel = supabase
      .channel('global-realtime-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_orders' }, () => invalidate('orders'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checklist_items' }, () => invalidate('orders'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'materials' }, () => invalidate('all'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => invalidate('all'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_flow' }, () => invalidate('cash'))
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
