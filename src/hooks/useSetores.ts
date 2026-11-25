// Setores da venda da loja (ex.: Balcão, Online, Estofaria). Sem setor cadastrado = recurso desligado.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useStore } from '@/contexts/StoreContext';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface SetorVenda {
  id: string;
  nome: string;
  padrao_balcao: boolean;
  padrao_os: boolean;
  ativo: boolean;
  ordem: number;
}

export function useSetores() {
  const { storeId } = useStore();
  const q = useQuery({
    queryKey: ['setores-venda', storeId],
    enabled: !!storeId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<SetorVenda[]> => {
      const { data, error } = await db.from('setores_venda').select('id, nome, padrao_balcao, padrao_os, ativo, ordem').order('ordem').order('nome');
      if (error) throw error;
      return (data ?? []) as SetorVenda[];
    },
  });
  const setores = q.data ?? [];
  const ativos = setores.filter((s) => s.ativo);
  const nome = (id: string | null | undefined) => (id ? setores.find((s) => s.id === id)?.nome ?? null : null);
  return { ...q, setores, ativos, usa: ativos.length > 0, nome };
}
