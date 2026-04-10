import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User } from '@supabase/supabase-js';
import type { MemberPermissions } from '@/hooks/useAuth';

const ALL_PERMISSIONS: MemberPermissions = {
  nova_os: true, express: true, orders: true, agenda: true, quadro: true,
  caixa: true, balcao: true, relatorios: true, boletos: true, fiados: true,
  estoque: true, equipe: true, pos_venda: true, satisfacao: true,
};

interface StoreContextValue {
  storeId: string | null;
  plan: string | null;
  loading: boolean;
  role: string | null;
  permissions: MemberPermissions;
  isOwner: boolean;
}

const StoreContext = createContext<StoreContextValue>({
  storeId: null,
  plan: null,
  loading: true,
  role: null,
  permissions: ALL_PERMISSIONS,
  isOwner: false,
});

export function StoreProvider({ user, children }: { user: User | null; children: ReactNode }) {
  const [storeId, setStoreId] = useState<string | null>(null);
  const [plan, setPlan] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<MemberPermissions>(ALL_PERMISSIONS);

  useEffect(() => {
    if (!user) {
      setStoreId(null);
      setPlan(null);
      setRole(null);
      setPermissions(ALL_PERMISSIONS);
      setLoading(false);
      return;
    }

    // Query original que funcionava — busca store_id e plan
    supabase
      .from('store_members')
      .select('store_id, role, permissions, store_settings(plan)')
      .eq('user_id', user.id)
      .eq('active', true)
      .maybeSingle()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then(({ data, error }: { data: any; error: unknown }) => {
        if (error) console.error('StoreContext error:', error);
        if (data) {
          setStoreId(data.store_id);
          setRole(data.role ?? null);
          setPlan(data.store_settings?.plan ?? 'basic');
          if (data.role === 'owner') {
            setPermissions(ALL_PERMISSIONS);
          } else {
            setPermissions({ ...ALL_PERMISSIONS, ...(data.permissions || {}) });
          }
        }
        setLoading(false);
      });
  }, [user?.id]);

  const isOwner = role === 'owner';

  return (
    <StoreContext.Provider value={{ storeId, plan, loading, role, permissions, isOwner }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  return useContext(StoreContext);
}
