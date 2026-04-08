import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User } from '@supabase/supabase-js';

interface StoreContextValue {
  storeId: string | null;
  plan: string | null;
  loading: boolean;
}

const StoreContext = createContext<StoreContextValue>({
  storeId: null,
  plan: null,
  loading: true,
});

export function StoreProvider({ user, children }: { user: User | null; children: ReactNode }) {
  const [storeId, setStoreId] = useState<string | null>(null);
  const [plan, setPlan] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setStoreId(null);
      setPlan(null);
      setLoading(false);
      return;
    }

    supabase
      .from('store_members')
      .select('store_id, store_settings(plan)')
      .eq('user_id', user.id)
      .eq('active', true)
      .single()
      .then(({ data }) => {
        if (data) {
          setStoreId(data.store_id);
          const settings = data.store_settings as { plan?: string } | null;
          setPlan(settings?.plan ?? 'basic');
        }
        setLoading(false);
      });
  }, [user?.id]);

  return (
    <StoreContext.Provider value={{ storeId, plan, loading }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  return useContext(StoreContext);
}
