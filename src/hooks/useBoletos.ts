import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type BoletoCategoria = 'fornecedor' | 'aluguel' | 'conta_fixa' | 'imposto' | 'outro';
export type BoletoRecorrencia = 'nenhuma' | 'mensal' | 'bimestral' | 'trimestral' | 'anual';
export type BoletoPaidMethod = 'dinheiro' | 'pix' | 'debito' | 'credito' | 'ted_doc';

export interface Boleto {
  id: string;
  store_id: string;
  credor: string;
  valor: number;
  vencimento: string; // YYYY-MM-DD
  codigo_barras?: string | null;
  categoria: BoletoCategoria;
  recorrencia: BoletoRecorrencia;
  alert_days: number[]; // 0=no dia, 1=1 dia antes, etc.
  notify_sistema: boolean;
  notify_whatsapp: boolean;
  juros?: number | null;
  pix_copia_cola?: string | null;
  observacoes?: string | null;
  paid_at?: string | null;
  paid_method?: BoletoPaidMethod | null;
  created_at: string;
  updated_at: string;
}

export type BoletoStatus = 'pago' | 'vencido' | 'vence_hoje' | 'proximo' | 'aberto';

export function getBoletoStatus(boleto: Boleto): BoletoStatus {
  if (boleto.paid_at) return 'pago';
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const [y, m, d] = boleto.vencimento.split('-').map(Number);
  const venc = new Date(y, m - 1, d);
  const diffDias = Math.round((venc.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDias < 0) return 'vencido';
  if (diffDias === 0) return 'vence_hoje';
  if (diffDias <= 3) return 'proximo';
  return 'aberto';
}

export function useBoletos() {
  const queryClient = useQueryClient();

  const { data: boletos = [], isLoading } = useQuery({
    queryKey: ['boletos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('boletos')
        .select('*')
        .order('vencimento', { ascending: true });
      if (error) throw error;
      return data as Boleto[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (payload: Omit<Boleto, 'id' | 'store_id' | 'created_at' | 'updated_at'>) => {
      const { data: storeData } = await supabase.from('store_settings').select('id').limit(1).single();
      if (!storeData) throw new Error('Store não encontrada');
      const { data, error } = await supabase
        .from('boletos')
        .insert({ ...payload, store_id: storeData.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boletos'] });
      toast.success('Boleto cadastrado!');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...payload }: Partial<Boleto> & { id: string }) => {
      const { data, error } = await supabase
        .from('boletos')
        .update(payload)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boletos'] });
      toast.success('Boleto atualizado!');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('boletos').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boletos'] });
      toast.success('Boleto excluído!');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const marcarPago = (id: string, paid_at: string, paid_method: BoletoPaidMethod) =>
    updateMutation.mutate({ id, paid_at, paid_method });

  const marcarAberto = (id: string) =>
    updateMutation.mutate({ id, paid_at: null, paid_method: null });

  // Boletos que precisam de alerta hoje
  const alertasHoje = boletos.filter(b => {
    if (b.paid_at) return false;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const [y, m, d] = b.vencimento.split('-').map(Number);
    const venc = new Date(y, m - 1, d);
    const diffDias = Math.round((venc.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
    return b.alert_days.includes(diffDias) || (diffDias === 0 && b.alert_days.includes(0));
  });

  return {
    boletos,
    isLoading,
    alertasHoje,
    createBoleto: (p: Omit<Boleto, 'id' | 'store_id' | 'created_at' | 'updated_at'>) => createMutation.mutate(p),
    updateBoleto: (p: Partial<Boleto> & { id: string }) => updateMutation.mutate(p),
    deleteBoleto: (id: string) => deleteMutation.mutate(id),
    marcarPago,
    marcarAberto,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
  };
}
