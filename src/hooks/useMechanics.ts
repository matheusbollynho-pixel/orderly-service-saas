import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Mechanic } from '@/types/service-order';
import { toast } from 'sonner';

export function useMechanics() {
  const queryClient = useQueryClient();

  const mechanicsQuery = useQuery({
    queryKey: ['mechanics'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mechanics')
        .select('*')
        .order('active', { ascending: false })
        .order('name', { ascending: true });
      if (error) throw error;
      return data as Mechanic[];
    },
  });

  const createMechanic = useMutation({
    mutationFn: async (payload: { name: string; commission_rate?: number; photo_url?: string | null }) => {
      const { data, error } = await supabase
        .from('mechanics')
        .insert({
          name: payload.name,
          commission_rate: payload.commission_rate ?? 0,
          photo_url: payload.photo_url ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as Mechanic;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mechanics'] });
      toast.success('Mecânico cadastrado!');
    },
    onError: (e: any) => {
      toast.error(`Erro ao cadastrar mecânico: ${e?.message || 'Erro desconhecido'}`);
    },
  });

  const updateMechanic = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Mechanic> & { id: string }) => {
      const { data, error } = await supabase
        .from('mechanics')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as Mechanic;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mechanics'] });
      toast.success('Mecânico atualizado!');
    },
    onError: () => toast.error('Erro ao atualizar mecânico'),
  });

  const deleteMechanic = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('mechanics')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mechanics'] });
      toast.success('Mecânico removido!');
    },
    onError: () => toast.error('Erro ao remover mecânico'),
  });

  return {
    mechanics: mechanicsQuery.data ?? [],
    isLoading: mechanicsQuery.isLoading,
    error: mechanicsQuery.error,
    createMechanic: createMechanic.mutate,
    updateMechanic: updateMechanic.mutate,
    deleteMechanic: deleteMechanic.mutate,
  };
}
