import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export function useSuperAdmin() {
  const { user } = useAuth();
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setIsSuperAdmin(false); setLoading(false); return; }
    supabase
      .from('super_admins' as never)
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        setIsSuperAdmin(!!data);
        setLoading(false);
      });
  }, [user?.id]);

  return { isSuperAdmin, loading };
}
