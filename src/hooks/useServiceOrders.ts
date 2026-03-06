import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ServiceOrder, ChecklistItem, OrderStatus, DEFAULT_CHECKLIST_ITEMS } from '@/types/service-order';
import { toast } from 'sonner';

const QR_PLACEHOLDER_EQUIPMENT = '__QR_WALKIN_PLACEHOLDER__';


export function useServiceOrders() {
  const queryClient = useQueryClient();

  // ============ REALTIME SUBSCRIPTION ============
  useEffect(() => {
    // Escutar mudanças em tempo real na tabela service_orders
    const subscription = supabase
      .channel('realtime:service_orders')
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'service_orders',
        },
        (payload) => {
          console.log('📡 Mudança em tempo real detectada:', payload);
          // Invalidar cache para refetch automático
          queryClient.invalidateQueries({ queryKey: ['service-orders'] });
        }
      )
      .subscribe();

    // Cleanup: unsubscribe ao desmontar
    return () => {
      subscription.unsubscribe();
    };
  }, [queryClient]);

  const ordersQuery = useQuery({
    queryKey: ['service-orders'],
    queryFn: async () => {
      let data: any[] | null = null;

      // Otimização: buscar apenas as últimas 10 OS (as mais usadas)
      // Usuários buscam por filtro para ordens mais antigas
      const fullQuery = await supabase
        .from('service_orders')
        .select(`
          *,
          checklist_items (*),
          materials (*),
          payments (*),
          clients:client_id (autoriza_lembretes, autoriza_instagram)
        `)
        .order('created_at', { ascending: false })
        .limit(10);

      if (fullQuery.error) {
        console.error('❌ Erro na query completa de ordens. Aplicando fallback simples:', fullQuery.error);

        // Fallback: buscar apenas dados básicos
        const fallbackQuery = await supabase
          .from('service_orders')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(10);

        if (fallbackQuery.error) throw fallbackQuery.error;
        data = fallbackQuery.data as any[];
      } else {
        data = fullQuery.data as any[];
      }
      
      // Remover ordens técnicas usadas apenas para fluxo de avaliação QR
      const visibleOrders = (data as any[]).filter((order) => {
        if (order?.equipment === QR_PLACEHOLDER_EQUIPMENT) return false;
        if (order?.equipment === 'Avaliação de balcão' && order?.problem_description === 'Avaliação sem OS') return false;
        return true;
      });

      // Mapear os dados do cliente para o objeto de ordem
      return visibleOrders.map(order => {
        const clientData = Array.isArray(order.clients) ? order.clients[0] : order.clients;
        return {
          ...order,
          autoriza_lembretes: (clientData?.autoriza_lembretes ?? order.autoriza_lembretes) !== false ? true : false,
          autoriza_instagram: (clientData?.autoriza_instagram ?? order.autoriza_instagram) !== false ? true : false,
          clients: undefined, // Remover o campo temporário
        };
      }) as ServiceOrder[];
    },
    // Otimizações de performance
    staleTime: 30000, // Considera dados "frescos" por 30 segundos
    refetchInterval: 15000, // Refetch apenas a cada 15 segundos (reduzido de 4s)
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    // Retry apenas 1 vez em caso de erro
    retry: 1,
    retryDelay: 1000,
  });

  const createOrderMutation = useMutation({
    mutationFn: async (
      order: Omit<
        ServiceOrder,
        'id' | 'created_at' | 'updated_at' | 'status' | 'signature_data' | 'checklist_items' | 'materials' | 'payments'
      >
    ) => {
      console.log('🔧 Criando OS com dados:', order);
      
      const { data: newOrder, error: orderError } = await supabase
        .from('service_orders')
        .insert({
          client_id: order.client_id ?? null,
          motorcycle_id: order.motorcycle_id ?? null,
          atendimento_id: order.atendimento_id ?? null,
          client_name: order.client_name,
          client_cpf: order.client_cpf ?? '',
          client_apelido: order.client_apelido ?? '',
          client_instagram: order.client_instagram ?? '',
          autoriza_instagram: order.autoriza_instagram ?? false,
          client_phone: order.client_phone,
          client_address: order.client_address,
          client_birth_date: order.client_birth_date ?? null,
          entry_date: order.entry_date ?? null,
          exit_date: order.exit_date ?? null,
          equipment: order.equipment,
          problem_description: order.problem_description,
        })
        .select()
        .single();

      if (orderError) {
        console.error('❌ Erro ao inserir OS:', orderError);
        throw orderError;
      }

      console.log('✅ OS criada:', newOrder);

      const checklistItems = DEFAULT_CHECKLIST_ITEMS.map(item => ({
        order_id: newOrder.id,
        label: typeof item === 'string' ? item : item.label,
        item_type: typeof item === 'string' ? 'checkbox' : item.type,
        completed: false,
      }));

      const { error: checklistError } = await supabase
        .from('checklist_items')
        .insert(checklistItems);

      if (checklistError) {
        console.error('❌ Erro ao inserir checklist:', checklistError);
        throw checklistError;
      }

      console.log('✅ Checklist criado');
      return newOrder;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-orders'] });
      toast.success('Ordem de serviço criada com sucesso!');
    },
    onError: (error: any) => {
      console.error('❌ Erro final:', error);
      toast.error(`Erro ao criar ordem de serviço: ${error?.message || 'Erro desconhecido'}`);
    },
  });

  const updateOrderMutation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ServiceOrder> & { id: string }) => {
      // Filtrar campos que não pertencem à tabela service_orders
      const nonServiceOrderFields = [
        'autoriza_lembretes',
        'autoriza_instagram',
      ];
      const serviceOrderUpdates = Object.fromEntries(
        Object.entries(updates).filter(([key]) => !nonServiceOrderFields.includes(key))
      );

      // Se não há campos para atualizar em service_orders, apenas retornar
      if (Object.keys(serviceOrderUpdates).length === 0) {
        return null;
      }

      const { data, error } = await supabase
        .from('service_orders')
        .update(serviceOrderUpdates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: async (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['service-orders'] });
      toast.success('Ordem de serviço atualizada!');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar ordem de serviço');
      console.error(error);
    },
  });

  const updateChecklistItemMutation = useMutation({
    mutationFn: async (updates: { id: string; completed?: boolean; rating?: number; observations?: string }) => {
      const updateData: any = {};
      
      if (updates.completed !== undefined) {
        updateData.completed = updates.completed;
        updateData.completed_at = updates.completed ? new Date().toISOString() : null;
      }
      
      if (updates.rating !== undefined) {
        updateData.rating = updates.rating;
      }
      
      if (updates.observations !== undefined) {
        updateData.observations = updates.observations;
      }

      const { data, error } = await supabase
        .from('checklist_items')
        .update(updateData)
        .eq('id', updates.id)
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

  const createMaterialMutation = useMutation({
    mutationFn: async (material: any) => {
      // Remover o campo client_temp_id do payload enviado ao servidor
      const { client_temp_id, ...serverMaterial } = material || {};
      const { data, error } = await supabase
        .from('materials')
        .insert(serverMaterial)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data, variables: any) => {
      // Atualiza cache do React Query substituindo o item temp (se houver)
      const orderId = variables?.order_id;
      const clientTempId = variables?.client_temp_id as string | undefined;
      if (orderId) {
        const previousOrders = queryClient.getQueryData(['service-orders']) as ServiceOrder[] | undefined;
        if (previousOrders) {
          queryClient.setQueryData(['service-orders'], (old: ServiceOrder[]) =>
            old.map(order => {
              if (order.id !== orderId) return order;
              const materials = order.materials || [];
              // 1) Preferir casar pelo client_temp_id
              if (clientTempId) {
                const idxByTemp = materials.findIndex(m => m.id === clientTempId);
                if (idxByTemp >= 0) {
                  const clone = [...materials];
                  clone[idxByTemp] = data as any;
                  return { ...order, materials: clone } as ServiceOrder;
                }
              }
              // 2) Fallback: tentar casar por campos principais
              const idxByFields = materials.findIndex(m =>
                typeof m.id === 'string' && m.id.startsWith('temp-') &&
                m.descricao === variables.descricao &&
                m.quantidade === variables.quantidade &&
                (m.valor ?? 0) === (variables.valor ?? 0)
              );
              if (idxByFields >= 0) {
                const clone = [...materials];
                clone[idxByFields] = data as any;
                return { ...order, materials: clone } as ServiceOrder;
              }
              // 3) Se não achar, adiciona o novo ao final
              return { ...order, materials: [...materials, data as any] } as ServiceOrder;
            })
          );
        }
      }
      toast.success('Material adicionado!');
    },
    onError: (error: any) => {
      console.error('Material error:', error);
      toast.error(`Erro ao adicionar material: ${error?.message || 'Erro desconhecido'}`);
    },
  });

  const updateMaterialMutation = useMutation({
    mutationFn: async ({ id, ...updates }: any) => {
      const { data, error } = await supabase
        .from('materials')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-orders'] });
      toast.success('Material atualizado!');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar material');
      console.error(error);
    },
  });

  const deleteMaterialMutation = useMutation({
    mutationFn: async (id: string) => {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(id)) {
        return;
      }

      const { error } = await supabase
        .from('materials')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-orders'] });
      toast.success('Material removido!');
    },
    onError: (error) => {
      toast.error('Erro ao remover material');
      console.error(error);
    },
  });

  const markMaterialAsPaidMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('materials')
        .update({ paid_at: new Date().toISOString() } as any)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-orders'] });
      toast.success('Material marcado como pago!');
    },
    onError: (error) => {
      toast.error('Erro ao marcar como pago');
      console.error(error);
    },
  });

  const markMaterialAsUnpaidMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('materials')
        .update({ paid_at: null } as any)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-orders'] });
      toast.success('Pagamento removido!');
    },
    onError: (error) => {
      toast.error('Erro ao remover pagamento');
      console.error(error);
    },
  });

  // Payments: create and delete
  const createPaymentMutation = useMutation({
    mutationFn: async (payload: { order_id: string; amount: number; discount_amount?: number | null; method: string; reference?: string | null; notes?: string | null; finalized_by_staff_id?: string | null }) => {
      const { data, error } = await supabase
        .from('payments')
        .insert({
          order_id: payload.order_id,
          amount: payload.amount,
          discount_amount: payload.discount_amount ?? 0,
          method: payload.method,
          reference: payload.reference || null,
          notes: payload.notes || null,
          finalized_by_staff_id: payload.finalized_by_staff_id || null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-orders'] });
      // Invalidar cache do cash_flow para atualizar em tempo real
      queryClient.invalidateQueries({ queryKey: ['cash-flow'] });
      queryClient.invalidateQueries({ queryKey: ['cash-flow-summary'] });
      queryClient.invalidateQueries({ queryKey: ['cash-flow-period'] });
      toast.success('Pagamento registrado!');
    },
    onError: (error: any) => {
      console.error('Payment error:', error);
      toast.error(`Erro ao registrar pagamento: ${error?.message || 'Erro desconhecido'}`);
    },
  });

  const deletePaymentMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('payments')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-orders'] });
      queryClient.invalidateQueries({ queryKey: ['cash-flow'] });
      queryClient.invalidateQueries({ queryKey: ['cash-flow-summary'] });
      queryClient.invalidateQueries({ queryKey: ['cash-flow-period'] });
      toast.success('Pagamento removido!');
    },
    onError: (error: any) => {
      console.error('Delete payment error:', error);
      toast.error(`Erro ao remover pagamento: ${error?.message || 'Erro desconhecido'}`);
    },
  });

  const updatePaymentMutation = useMutation({
    mutationFn: async (payload: { id: string; created_at?: string; amount?: number; discount_amount?: number | null; method?: string; notes?: string | null }) => {
      const { data, error } = await supabase
        .from('payments')
        .update({
          ...(payload.created_at && { created_at: payload.created_at }),
          ...(payload.amount && { amount: payload.amount }),
          ...(payload.discount_amount !== undefined && { discount_amount: payload.discount_amount }),
          ...(payload.method && { method: payload.method }),
          ...(payload.notes !== undefined && { notes: payload.notes }),
        })
        .eq('id', payload.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-orders'] });
      queryClient.invalidateQueries({ queryKey: ['cash-flow'] });
      queryClient.invalidateQueries({ queryKey: ['cash-flow-summary'] });
      queryClient.invalidateQueries({ queryKey: ['cash-flow-period'] });
      toast.success('Pagamento atualizado!');
    },
    onError: (error: any) => {
      console.error('Update payment error:', error);
      toast.error(`Erro ao atualizar pagamento: ${error?.message || 'Erro desconhecido'}`);
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
    createMaterial: createMaterialMutation.mutate,
    updateMaterial: updateMaterialMutation.mutate,
    deleteMaterial: deleteMaterialMutation.mutate,
    markMaterialAsPaid: markMaterialAsPaidMutation.mutate,
    markMaterialAsUnpaid: markMaterialAsUnpaidMutation.mutate,
    isCreating: createOrderMutation.isPending,
    isUpdating: updateOrderMutation.isPending,
    // Material mutation states
    isCreatingMaterial: createMaterialMutation.isPending,
    isUpdatingMaterial: updateMaterialMutation.isPending,
    isDeletingMaterial: deleteMaterialMutation.isPending,
    isMarkingAsPaid: markMaterialAsPaidMutation.isPending,
    // Payments
    createPayment: createPaymentMutation.mutate,
    deletePayment: deletePaymentMutation.mutate,
    updatePayment: updatePaymentMutation.mutate,
    isCreatingPayment: createPaymentMutation.isPending,
    isDeletingPayment: deletePaymentMutation.isPending,
    isUpdatingPayment: updatePaymentMutation.isPending,
  };
}
