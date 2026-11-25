import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User } from '@supabase/supabase-js';
import type { MemberPermissions } from '@/hooks/useAuth';

const ALL_PERMISSIONS: MemberPermissions = {
  nova_os: true, express: true, orders: true, agenda: true, quadro: true,
  caixa: true, balcao: true, relatorios: true, boletos: true, fiados: true,
  estoque: true, equipe: true, pos_venda: true, satisfacao: true, clientes: true,
  editar_itens_os: true, excluir_os: true, dar_desconto: true, estornar: true, ajustar_estoque: true, pagar_equipe: true, abrir_fechar_caixa: true,
};

/** Login ligado a um mecânico ou atendente (conta pessoal). Sem isso = conta compartilhada. */
export type ColaboradorLogin = { tipo: 'mecanico' | 'atendente'; id: string } | null;

interface StoreContextValue {
  storeId: string | null;
  plan: string | null;
  loading: boolean;
  role: string | null;
  permissions: MemberPermissions;
  isOwner: boolean;
  vehicleType: 'moto' | 'carro' | 'ambos';
  onboarded: boolean;
  customFeatures: string[] | null;
  colaborador: ColaboradorLogin;
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
  colaborador: null,
});

export function StoreProvider({ user, children }: { user: User | null; children: ReactNode }) {
  const [storeId, setStoreId] = useState<string | null>(null);
  const [plan, setPlan] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<MemberPermissions>(ALL_PERMISSIONS);
  const [vehicleType, setVehicleType] = useState<'moto' | 'carro' | 'ambos'>('moto');
  const [onboarded, setOnboarded] = useState(true);
  const [customFeatures, setCustomFeatures] = useState<string[] | null>(null);
  const [colaborador, setColaborador] = useState<ColaboradorLogin>(null);

  useEffect(() => {
    // Modo single-tenant: VITE_STORE_ID definido no ambiente
    const envStoreId = import.meta.env.VITE_STORE_ID as string | undefined;
    if (envStoreId) {
      if (user) {
        setStoreId(envStoreId);
        setRole('owner');
        setPermissions(ALL_PERMISSIONS);
        // Usa VITE_PLAN se definido, senão busca do banco
        const envPlan = import.meta.env.VITE_PLAN as string | undefined;
        const envVehicle = import.meta.env.VITE_VEHICLE_LABEL as string | undefined;
        if (envPlan) {
          setPlan(envPlan);
          setVehicleType(envVehicle?.toLowerCase() === 'carro' ? 'carro' : 'moto');
        } else {
          supabase
            .from('store_settings')
            .select('plan, vehicle_type, custom_features')
            .eq('id', envStoreId)
            .maybeSingle()
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .then(({ data, error }: { data: any; error: any }) => {
              if (!error && data) {
                setPlan(data.plan ?? 'basic');
                setVehicleType(data.vehicle_type ?? 'moto');
                setCustomFeatures(data.custom_features ?? null);
              }
            });
        }
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
      setColaborador(null);
      setPermissions(ALL_PERMISSIONS);
      setLoading(false);
      return;
    }

    // Modo SaaS: busca store_id e plan na tabela store_members
    supabase
      .from('store_members')
      .select('store_id, role, permissions, colaborador_tipo, colaborador_id, store_settings(plan, vehicle_type, onboarded, custom_features)')
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
          setColaborador(data.colaborador_tipo && data.colaborador_id ? { tipo: data.colaborador_tipo, id: data.colaborador_id } : null);
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
    <StoreContext.Provider value={{ storeId, plan, loading, role, permissions, isOwner, vehicleType, onboarded, customFeatures, colaborador }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  return useContext(StoreContext);
}
