import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export function useSuperAdmin() {
  const { user, loading: authLoading } = useAuth();
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (authLoading) return; // aguarda auth terminar
    if (!user) { setIsSuperAdmin(false); setChecking(false); return; }
    supabase
      .from('super_admins' as never)
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        setIsSuperAdmin(!!data);
        setChecking(false);
      });
  }, [user?.id, authLoading]);

  return { isSuperAdmin, loading: checking || authLoading };
}
