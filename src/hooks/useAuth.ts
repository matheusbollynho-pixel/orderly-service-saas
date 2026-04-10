import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User } from '@supabase/supabase-js';

export type MemberPermissions = {
  nova_os: boolean;
  express: boolean;
  orders: boolean;
  agenda: boolean;
  quadro: boolean;
  caixa: boolean;
  balcao: boolean;
  relatorios: boolean;
  boletos: boolean;
  fiados: boolean;
  estoque: boolean;
  equipe: boolean;
  pos_venda: boolean;
  satisfacao: boolean;
};

const ALL_PERMISSIONS: MemberPermissions = {
  nova_os: true, express: true, orders: true, agenda: true, quadro: true,
  caixa: true, balcao: true, relatorios: true, boletos: true, fiados: true,
  estoque: true, equipe: true, pos_venda: true, satisfacao: true,
};

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<MemberPermissions>(ALL_PERMISSIONS);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription?.unsubscribe();
  }, []);

  // Carrega role e permissions do store_members quando user muda
  useEffect(() => {
    if (!user) {
      setRole(null);
      setPermissions(ALL_PERMISSIONS);
      return;
    }

    supabase
      .from('store_members' as never)
      .select('role, permissions')
      .eq('user_id', user.id)
      .eq('active', true)
      .maybeSingle()
      .then(({ data }: { data: { role: string; permissions: MemberPermissions | null } | null }) => {
        if (data) {
          setRole(data.role);
          // owner sempre tem tudo; colaboradores usam permissões do banco
          if (data.role === 'owner') {
            setPermissions(ALL_PERMISSIONS);
          } else {
            setPermissions({ ...ALL_PERMISSIONS, ...(data.permissions || {}) });
          }
        }
      });
  }, [user?.id]);

  const isOwner = role === 'owner';
  const isAdmin = !!user;
  const isRestrictedUser = !!user && role !== null && role !== 'owner';

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return {
    user,
    loading,
    role,
    isAdmin,
    isOwner,
    isRestrictedUser,
    permissions,
    // Compat legada
    canAccessCashFlow: permissions.caixa,
    canAccessReports: permissions.relatorios,
    signOut,
  };
}
