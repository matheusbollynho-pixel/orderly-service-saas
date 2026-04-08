import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { StaffMember } from '@/types/service-order';
import { toast } from 'sonner';
import { useStore } from '@/contexts/StoreContext';

export function useTeamMembers() {
  const queryClient = useQueryClient();
  const { storeId } = useStore();

  const query = useQuery({
    queryKey: ['staff-members'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff_members')
        .select('*')
        .order('active', { ascending: false })
        .order('name', { ascending: true });

      if (error) throw error;
      return (data || []) as StaffMember[];
    },
  });

  const createMember = useMutation({
    mutationFn: async (payload: { name: string; role: StaffMember['role']; photo_url?: string | null; commission_rate?: number; commission_on_parts?: boolean }) => {
      const { data, error } = await supabase
        .from('staff_members')
        .insert({
          name: payload.name,
          role: payload.role,
          photo_url: payload.photo_url ?? null,
          commission_rate: payload.commission_rate ?? 0,
          commission_on_parts: payload.commission_on_parts ?? false,
          store_id: storeId!,
        })
        .select()
        .single();

      if (error) throw error;
      return data as StaffMember;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-members'] });
      toast.success('Atendente cadastrado!');
    },
    onError: (e: Error | unknown) => {
      toast.error(`Erro ao cadastrar atendente: ${(e as Error)?.message || 'Erro desconhecido'}`);
    },
  });

  const updateMember = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<StaffMember> & { id: string }) => {
      const { data, error } = await supabase
        .from('staff_members')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as StaffMember;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-members'] });
      toast.success('Atendente atualizado!');
    },
    onError: (e: Error | unknown) => {
      toast.error(`Erro ao atualizar atendente: ${(e as Error)?.message || 'Erro desconhecido'}`);
    },
  });

  const deleteMember = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('staff_members')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-members'] });
      toast.success('Atendente removido!');
    },
    onError: (e: Error | unknown) => {
      toast.error(`Erro ao remover atendente: ${(e as Error)?.message || 'Erro desconhecido'}`);
    },
  });

  return {
    members: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    createMember: createMember.mutate,
    updateMember: updateMember.mutate,
    deleteMember: deleteMember.mutate,
  };
}
