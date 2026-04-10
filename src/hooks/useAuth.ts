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

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

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

  const isAdmin = !!user;

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return {
    user,
    loading,
    isAdmin,
    signOut,
  };
}
