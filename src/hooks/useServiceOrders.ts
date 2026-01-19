import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ServiceOrder, ChecklistItem, OrderStatus, DEFAULT_CHECKLIST_ITEMS } from '@/types/service-order';
import { toast } from 'sonner';

export function useServiceOrders() {
  const queryClient = useQueryClient();

  const ordersQuery = useQuery({
    queryKey: ['service-orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_orders')
        .select(`
          *,
          checklist_items (*)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as ServiceOrder[];
    },
  });

  const createOrderMutation = useMutation({
    mutationFn: async (order: Omit<ServiceOrder, 'id' | 'created_at' | 'updated_at' | 'status' | 'signature_data' | 'checklist_items'>) => {
      // Create the order
      const { data: newOrder, error: orderError } = await supabase
        .from('service_orders')
        .insert({
          client_name: order.client_name,
          client_phone: order.client_phone,
          client_address: order.client_address,
          equipment: order.equipment,
          problem_description: order.problem_description,
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Create default checklist items
      const checklistItems = DEFAULT_CHECKLIST_ITEMS.map(label => ({
        order_id: newOrder.id,
        label,
        completed: false,
      }));

      const { error: checklistError } = await supabase
        .from('checklist_items')
        .insert(checklistItems);

      if (checklistError) throw checklistError;

      return newOrder;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-orders'] });
      toast.success('Ordem de serviço criada com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao criar ordem de serviço');
      console.error(error);
    },
  });

  const updateOrderMutation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ServiceOrder> & { id: string }) => {
      const { data, error } = await supabase
        .from('service_orders')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-orders'] });
      toast.success('Ordem de serviço atualizada!');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar ordem de serviço');
      console.error(error);
    },
  });

  const updateChecklistItemMutation = useMutation({
    mutationFn: async ({ id, completed }: { id: string; completed: boolean }) => {
      const { data, error } = await supabase
        .from('checklist_items')
        .update({ 
          completed, 
          completed_at: completed ? new Date().toISOString() : null 
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-orders'] });
    },
    onError: (error) => {
      toast.error('Erro ao atualizar checklist');
      console.error(error);
    },
  });

  const deleteOrderMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('service_orders')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-orders'] });
      toast.success('Ordem de serviço excluída!');
    },
    onError: (error) => {
      toast.error('Erro ao excluir ordem de serviço');
      console.error(error);
    },
  });

  return {
    orders: ordersQuery.data ?? [],
    isLoading: ordersQuery.isLoading,
    error: ordersQuery.error,
    createOrder: createOrderMutation.mutate,
    updateOrder: updateOrderMutation.mutate,
    updateChecklistItem: updateChecklistItemMutation.mutate,
    deleteOrder: deleteOrderMutation.mutate,
    isCreating: createOrderMutation.isPending,
    isUpdating: updateOrderMutation.isPending,
  };
}
