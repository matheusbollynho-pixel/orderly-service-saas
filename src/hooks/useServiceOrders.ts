import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ServiceOrder, ChecklistItem, OrderStatus, getDefaultChecklistItems } from '@/types/service-order';
import { toast } from 'sonner';
import { useStore } from '@/contexts/StoreContext';

const QR_PLACEHOLDER_EQUIPMENT = '__QR_WALKIN_PLACEHOLDER__';
const FULL_QUERY_LIMIT = 200;
const FALLBACK_QUERY_LIMIT = 300;

// Colunas base para queries de OS (não incluir campos grandes desnecessários)
// ATENÇÃO: signature_data e delivery_signature_data foram incluídos para garantir persistência das assinaturas.
// Caso precise reverter, basta comentar as linhas abaixo novamente.
const SERVICE_ORDERS_BASE_COLUMNS = [
  'id',
  'client_id',
  'motorcycle_id',
  'atendimento_id',
  'client_name',
  'client_cpf',
  'client_apelido',
  'client_instagram',
  'autoriza_instagram',
  'client_phone',
  'client_address',
  'client_birth_date',
  'equipment',
  'problem_description',
  'status',
  'terms_accepted',
  'delivery_terms_accepted',
  'entry_date',
  'exit_date',
  'conclusion_date',
  'previsao_entrega',
  'status_oficina',
  'created_at',
  'updated_at',
  'mechanic_id',
  'signature_data', // incluído para persistência da assinatura
  'delivery_signature_data', // incluído para persistência da assinatura de entrega
];


export function useServiceOrders() {
  const queryClient = useQueryClient();
  const { storeId, vehicleType } = useStore();

  // NOTA: Realtime sync está centralizado em useRealtimeSync para melhor performance
  // Removido daqui para evitar subscriptions duplicadas

  const ordersQuery = useQuery({
    queryKey: ['service-orders'],
    queryFn: async () => {
      let data: ServiceOrder[] | null = null;

      // Query principal otimizada (evita campos pesados como assinaturas em base64)
      const fullQuery = await supabase
        .from('service_orders')
        .select(`
          ${SERVICE_ORDERS_BASE_COLUMNS},
          checklist_items (*),
          materials (*),
          payments (*),
          clients:client_id (autoriza_lembretes, autoriza_instagram)
        `)
        .order('created_at', { ascending: false })
        .limit(FULL_QUERY_LIMIT);

      if (fullQuery.error) {
        console.error('❌ Erro na query completa de ordens. Aplicando fallback simples:', fullQuery.error);

        // Fallback robusto: busca base + relacionamentos em lotes separados
        const fallbackQuery = await supabase
          .from('service_orders')
          .select(SERVICE_ORDERS_BASE_COLUMNS)
          .order('created_at', { ascending: false })
          .limit(FALLBACK_QUERY_LIMIT);

        if (fallbackQuery.error) throw fallbackQuery.error;

        const baseOrders = (fallbackQuery.data as ServiceOrder[]) || [];
        const orderIds = baseOrders.map((order) => order.id).filter(Boolean);

        if (orderIds.length === 0) {
          data = [];
        } else {
          const [checklistRes, materialsRes, paymentsRes] = await Promise.all([
            supabase
              .from('checklist_items')
              .select('*')
              .in('order_id', orderIds),
            supabase
              .from('materials')
              .select('*')
              .in('order_id', orderIds),
            supabase
              .from('payments')
              .select('*')
              .in('order_id', orderIds),
          ]);

          const checklistByOrder = new Map<string, ChecklistItem[]>();
          const materialsByOrder = new Map<string, unknown[]>();
          const paymentsByOrder = new Map<string, unknown[]>();

          (checklistRes.data || []).forEach((item: ChecklistItem) => {
            const list = checklistByOrder.get(item.order_id) || [];
            list.push(item);
            checklistByOrder.set(item.order_id, list);
          });

          (materialsRes.data || []).forEach((item: unknown) => {
            const list = materialsByOrder.get(item.order_id) || [];
            list.push(item);
            materialsByOrder.set(item.order_id, list);
          });

          (paymentsRes.data || []).forEach((item: unknown) => {
            const list = paymentsByOrder.get(item.order_id) || [];
            list.push(item);
            paymentsByOrder.set(item.order_id, list);
          });

          data = baseOrders.map((order: ServiceOrder) => ({
            ...order,
            checklist_items: checklistByOrder.get(order.id) || [],
            materials: materialsByOrder.get(order.id) || [],
            payments: paymentsByOrder.get(order.id) || [],
          }));
        }
      } else {
        data = fullQuery.data as ServiceOrder[];
      }
      
      // Remover ordens técnicas usadas apenas para fluxo de avaliação QR
      const visibleOrders = (data as ServiceOrder[]).filter((order) => {
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
    // Otimizações balanceadas (performance + sync entre dispositivos)
    staleTime: 60 * 1000, // 60s - menos refetch pesado, sync principal via Realtime
    gcTime: 5 * 60 * 1000, // 5 minutos - mantém cache
    refetchOnWindowFocus: true, // Atualiza ao trocar de aba
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
      if (!storeId) throw new Error('Store não carregada. Tente novamente.');

      const { data: newOrder, error: orderError } = await supabase
        .from('service_orders')
        .insert({
          store_id: storeId,
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

      const checklistItems = getDefaultChecklistItems(vehicleType).map(item => ({
        store_id: storeId!,
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
    onError: (error: Error | unknown) => {
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

      const { error } = await supabase
        .from('service_orders')
        .update(serviceOrderUpdates)
        .eq('id', id);

      if (error) throw error;
      // Retorna apenas os campos atualizados para evitar payload pesado (ex: assinaturas base64)
      return { id, ...serviceOrderUpdates } as Partial<ServiceOrder>;
    },
    onMutate: async (variables: Partial<ServiceOrder> & { id: string }) => {
      // Cancela queries em voo para evitar que sobrescrevam a atualização otimista
      await queryClient.cancelQueries({ queryKey: ['service-orders'] });
      // Não invalidar aqui — o onSettled cuida disso após a mutation completar.
      // Invalidar em onMutate dispara refetch ANTES do banco confirmar a escrita,
      // retornando dados antigos e revertendo estados locais (checkbox, assinatura).
    },
    onSuccess: async (data: Partial<ServiceOrder> | null, variables: Partial<ServiceOrder> & { id: string }) => {
      queryClient.setQueryData(['service-orders'], (old: ServiceOrder[] | undefined) => {
        if (!old) return old;
        return old.map((order) => {
          if (order.id !== variables.id) return order;
          return {
            ...order,
            ...(data || {}),
          } as ServiceOrder;
        });
      });
    },
    onError: (error, _variables, context) => {
      if (context?.previousOrders) {
        queryClient.setQueryData(['service-orders'], context.previousOrders);
      }
      toast.error('Erro ao atualizar ordem de serviço');
      console.error(error);
    },
    onSettled: () => {
      // Refetch após mutation concluída para garantir dados frescos do DB (ex: status concluida_entregue)
      queryClient.invalidateQueries({ queryKey: ['service-orders'] });
    },
  });

  const updateChecklistItemMutation = useMutation({
    mutationFn: async (updates: { id: string; completed?: boolean; rating?: number; observations?: string }) => {
      const updateData: Record<string, unknown> = {};
      
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
      queryClient.invalidateQueries({ queryKey: ['inventory-products'] });
      toast.success('Ordem de serviço excluída!');
    },
    onError: (error) => {
      toast.error('Erro ao excluir ordem de serviço');
      console.error(error);
    },
  });

  const createMaterialMutation = useMutation({
    mutationFn: async (material: Record<string, unknown>) => {
      // Remover o campo client_temp_id do payload enviado ao servidor
      const { client_temp_id, ...serverMaterial } = material || {};
      const { data, error } = await supabase
        .from('materials')
        .insert({ ...serverMaterial, store_id: storeId! })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data: unknown, variables: Record<string, unknown>) => {
      // Atualiza cache do React Query substituindo o item temp (se houver)
      const orderId = variables?.order_id;
      const clientTempId = variables?.client_temp_id as string | undefined;
      if (orderId) {
        queryClient.setQueryData(['service-orders'], (old: ServiceOrder[]) =>
          old.map(order => {
            if (order.id !== orderId) return order;
            const materials = order.materials || [];
            // 1) Preferir casar pelo client_temp_id
            if (clientTempId) {
              const idxByTemp = materials.findIndex(m => m.id === clientTempId);
              if (idxByTemp >= 0) {
                const clone = [...materials];
                clone[idxByTemp] = data as unknown;
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
                clone[idxByFields] = data as unknown;
              return { ...order, materials: clone } as ServiceOrder;
            }
            // 3) Se não achar, adiciona o novo ao final
            return { ...order, materials: [...materials, data as unknown] } as ServiceOrder;
          })
        );
      }
      // Invalida estoque para refletir a baixa feita pelo trigger
      queryClient.invalidateQueries({ queryKey: ['inventory-products'] });
      toast.success('Material adicionado!');
    },
    onError: (error: Error | unknown) => {
      console.error('Material error:', error);
      toast.error(`Erro ao adicionar material: ${error?.message || 'Erro desconhecido'}`);
    },
  });

  const updateMaterialMutation = useMutation({
    mutationFn: async ({ id, ...updates }: Record<string, unknown>) => {
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
      queryClient.invalidateQueries({ queryKey: ['inventory-products'] });
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
        .update({ paid_at: new Date().toISOString() } as Record<string, unknown>)
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
        .update({ paid_at: null } as Record<string, unknown>)
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
          store_id: storeId!,
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
    onError: (error: Error | unknown) => {
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
    onError: (error: Error | unknown) => {
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
    onError: (error: Error | unknown) => {
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
