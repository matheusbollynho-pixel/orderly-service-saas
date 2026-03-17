import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { CashFlow, CashFlowSummary, CashFlowPeriodSummary } from '@/types/service-order';
import { toast } from 'sonner';

export function useCashFlow(selectedDate?: string) {
  const queryClient = useQueryClient();
  // Usar a data em timezone de Paulo Afonso (UTC-3)
  const getLocalDate = () => {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Fortaleza',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const parts = formatter.formatToParts(now);
    const day = parts.find(p => p.type === 'day')?.value || '01';
    const month = parts.find(p => p.type === 'month')?.value || '01';
    const year = parts.find(p => p.type === 'year')?.value || '2026';
    return `${year}-${month}-${day}`;
  };
  const date = selectedDate || getLocalDate();

  // Buscar todos os registros de um dia específico
  const cashFlowQuery = useQuery({
    queryKey: ['cash-flow', date],
    queryFn: async () => {
      console.log('🔍 Iniciando busca de cash-flow:', {
        dataBuscada: date,
        dataType: typeof date,
      });

      const { data, error } = await supabase
        .from('cash_flow')
        .select('*')
        .eq('date', date)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ Erro Supabase ao buscar:', {
          message: error.message,
          code: error.code,
          dataBuscada: date,
        });
        throw error;
      }

      console.log('✅ Busca concluída:', {
        dataBuscada: date,
        registrosEncontrados: data?.length || 0,
        dados: data?.map((d: CashFlow) => ({ id: d.id, description: d.description, date: d.date })),
      });

      return data as CashFlow[];
    },
    gcTime: 0,
    staleTime: 0,
    refetchInterval: 4000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  // Buscar resumo do dia
  const summaryQuery = useQuery({
    queryKey: ['cash-flow-summary', date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cash_flow')
        .select('*')
        .eq('date', date)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const entries = data as CashFlow[];
      const entradas = entries.filter(e => e.type === 'entrada');
      const saidas = entries.filter(e => e.type === 'saida');
      const retiradas = entries.filter(e => e.type === 'retirada');
      
      const total_entradas = entradas.reduce((sum, e) => sum + e.amount, 0);
      const total_saidas = saidas.reduce((sum, e) => sum + e.amount, 0);
      const total_retiradas = retiradas.reduce((sum, e) => sum + e.amount, 0);
      const saldo = total_entradas - total_saidas;

      return {
        date,
        total_entradas,
        total_saidas,
        total_retiradas,
        saldo,
        entradas,
        saidas,
        retiradas,
      } as CashFlowSummary;
    },
    gcTime: 5 * 60 * 1000, // 5 minutos
    staleTime: 30 * 1000, // 30 segundos - sync entre dispositivos
    refetchInterval: 20000, // 20 segundos - balanceado
    refetchOnWindowFocus: true, // Atualiza ao trocar de aba
    refetchOnReconnect: true,
  });

  // Criar entrada manual
  const createEntryMutation = useMutation({
    mutationFn: async (entry: Omit<CashFlow, 'id' | 'created_at' | 'created_by'>) => {
      const dateToInsert = getLocalDate();
      console.log('💾 Preparando para salvar:', {
        dateReceived: entry.date,
        dateEnforced: dateToInsert,
        dateToInsert,
        description: entry.description,
        amount: entry.amount,
        type: entry.type,
      });

      const insertPayload = {
        type: entry.type,
        amount: entry.amount,
        description: entry.description,
        category: entry.category || null,
        payment_method: entry.payment_method,
        date: dateToInsert,
        notes: entry.notes || null,
      };

      console.log('📤 Enviando para Supabase:', insertPayload);

      const { data, error } = await supabase
        .from('cash_flow')
        .insert(insertPayload)
        .select()
        .single();

      if (error) {
        console.error('❌ Erro Supabase ao salvar:', {
          message: error.message,
          code: error.code,
          details: error.details,
        });
        throw error;
      }

      console.log('✅ Salvo no BD com sucesso:', {
        id: data.id,
        date: data.date,
        description: data.description,
      });
      return data;
    },
    onSuccess: (data) => {
      console.log('🔄 Iniciando invalidação de queries...');
      // Invalidar TODAS as queries de cash-flow (dia, semana, mês)
      queryClient.invalidateQueries({ queryKey: ['cash-flow'] });
      queryClient.invalidateQueries({ queryKey: ['cash-flow-summary'] });
      queryClient.invalidateQueries({ queryKey: ['cash-flow-period'] });
      console.log('✅ Queries invalidadas, refetch deve acontecer agora');
      toast.success('Registro adicionado ao fluxo de caixa!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao adicionar registro: ${error.message}`);
    },
  });

  // Deletar entrada
  const deleteEntryMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('cash_flow')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-flow'] });
      queryClient.invalidateQueries({ queryKey: ['cash-flow-summary'] });
      queryClient.invalidateQueries({ queryKey: ['cash-flow-period'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-products'] });
      toast.success('Registro removido do fluxo de caixa!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao remover registro: ${error.message}`);
    },
  });

  // Atualizar entrada
  const updateEntryMutation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<CashFlow> & { id: string }) => {
      const { data, error } = await supabase
        .from('cash_flow')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-flow'] });
      queryClient.invalidateQueries({ queryKey: ['cash-flow-summary'] });
      queryClient.invalidateQueries({ queryKey: ['cash-flow-period'] });
      toast.success('Registro atualizado!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao atualizar registro: ${error.message}`);
    },
  });

  return {
    cashFlow: cashFlowQuery.data || [],
    summary: summaryQuery.data,
    isLoading: cashFlowQuery.isLoading || summaryQuery.isLoading,
    createEntry: createEntryMutation.mutate,
    deleteEntry: deleteEntryMutation.mutate,
    updateEntry: updateEntryMutation.mutate,
    isCreating: createEntryMutation.isPending,
    isDeleting: deleteEntryMutation.isPending,
    isUpdating: updateEntryMutation.isPending,
  };
}

export function useCashFlowPeriod(period: 'week' | 'month', selectedMonth?: string) {
  const today = new Date();

  const startOfWeek = () => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const date = new Date(d.setDate(diff));
    date.setHours(0, 0, 0, 0);
    return date;
  };

  const endOfWeek = () => {
    const start = startOfWeek();
    // Segunda + 5 dias = Sábado
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 5);
    end.setHours(23, 59, 59, 999);
    return end;
  };

  const startOfMonth = () => {
    let date: Date;
    if (selectedMonth) {
      const [year, month] = selectedMonth.split('-');
      date = new Date(parseInt(year), parseInt(month) - 1, 1);
    } else {
      date = new Date(today.getFullYear(), today.getMonth(), 1);
    }
    date.setHours(0, 0, 0, 0);
    return date;
  };

  const endOfMonth = () => {
    let date: Date;
    if (selectedMonth) {
      const [year, month] = selectedMonth.split('-');
      date = new Date(parseInt(year), parseInt(month), 0);
    } else {
      date = new Date(today);
    }
    date.setHours(23, 59, 59, 999);
    return date;
  };

  const startDate = period === 'week'
    ? startOfWeek()
    : startOfMonth();

  const endDate = period === 'week'
    ? endOfWeek()
    : endOfMonth();

  const start_date = startDate.toISOString().split('T')[0];
  const end_date = endDate.toISOString().split('T')[0];

  const summaryQuery = useQuery({
    queryKey: ['cash-flow-period', period, start_date, end_date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cash_flow')
        .select('*')
        .gte('date', start_date)
        .lte('date', end_date)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const entries = data as CashFlow[];
      const entradas = entries.filter(e => e.type === 'entrada');
      const saidas = entries.filter(e => e.type === 'saida');
      const retiradas = entries.filter(e => e.type === 'retirada');
      
      const total_entradas = entradas.reduce((sum, e) => sum + e.amount, 0);
      const total_saidas = saidas.reduce((sum, e) => sum + e.amount, 0);
      const total_retiradas = retiradas.reduce((sum, e) => sum + e.amount, 0);
      const saldo = total_entradas - total_saidas;

      return {
        start_date,
        end_date,
        total_entradas,
        total_saidas,
        total_retiradas,
        saldo,
        entradas,
        saidas,
        retiradas,
      } as CashFlowPeriodSummary;
    },
    staleTime: 30 * 1000, // 30 segundos - sync entre dispositivos
    gcTime: 5 * 60 * 1000, // 5 minutos
    refetchInterval: 20000, // 20 segundos - balanceado
    refetchOnWindowFocus: true, // Atualiza ao trocar de aba
    refetchOnReconnect: true,
  });

  return {
    summary: summaryQuery.data,
    isLoading: summaryQuery.isLoading,
    error: summaryQuery.error,
  };
}
