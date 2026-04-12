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
  vehicleType: 'moto' | 'carro';
  onboarded: boolean;
  customFeatures: string[] | null;
}

const StoreContext = createContext<StoreContextValue>({
  storeId: null,
  plan: null,
  loading: true,
  role: null,
  permissions: ALL_PERMISSIONS,
  isOwner: false,
  vehicleType: 'moto',
  onboarded: true,
  customFeatures: null,
});

export function StoreProvider({ user, children }: { user: User | null; children: ReactNode }) {
  const [storeId, setStoreId] = useState<string | null>(null);
  const [plan, setPlan] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<MemberPermissions>(ALL_PERMISSIONS);
  const [vehicleType, setVehicleType] = useState<'moto' | 'carro'>('moto');
  const [onboarded, setOnboarded] = useState(true);
  const [customFeatures, setCustomFeatures] = useState<string[] | null>(null);

  useEffect(() => {
    // Modo single-tenant: VITE_STORE_ID definido no ambiente
    const envStoreId = import.meta.env.VITE_STORE_ID as string | undefined;
    if (envStoreId) {
      if (user) {
        setStoreId(envStoreId);
        setRole('owner');
        setPermissions(ALL_PERMISSIONS);
        // Busca plano e custom_features do banco (ou usa VITE_PLAN como fallback)
        const envPlan = import.meta.env.VITE_PLAN as string | undefined;
        supabase
          .from('store_settings')
          .select('plan, vehicle_type, custom_features')
          .eq('id', envStoreId)
          .maybeSingle()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .then(({ data }: { data: any }) => {
            setPlan(data?.plan ?? envPlan ?? 'basic');
            setVehicleType(data?.vehicle_type ?? 'moto');
            setCustomFeatures(data?.custom_features ?? null);
          });
      } else {
        setStoreId(null);
        setRole(null);
        setPermissions(ALL_PERMISSIONS);
      }
      setLoading(false);
      return;
    }

    if (!user) {
      setStoreId(null);
      setPlan(null);
      setRole(null);
      setPermissions(ALL_PERMISSIONS);
      setLoading(false);
      return;
    }

    // Modo SaaS: busca store_id e plan na tabela store_members
    supabase
      .from('store_members')
      .select('store_id, role, permissions, store_settings(plan, vehicle_type, onboarded, custom_features)')
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
          setVehicleType(data.store_settings?.vehicle_type ?? 'moto');
          setOnboarded(data.store_settings?.onboarded ?? true);
          setCustomFeatures(data.store_settings?.custom_features ?? null);
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
    <StoreContext.Provider value={{ storeId, plan, loading, role, permissions, isOwner, vehicleType, onboarded, customFeatures }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  return useContext(StoreContext);
}
