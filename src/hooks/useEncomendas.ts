import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useStore } from '@/contexts/StoreContext';
import { brl } from '@/hooks/useCotacao';
import { normalizeSearch } from '@/lib/textSearch';

// Tabela nova, ainda fora do types.ts gerado.
const db = supabase as unknown as SupabaseClient;

export type StatusEncomenda =
  | 'aguardando_cotacao' | 'cliente_avisado' | 'aprovado' | 'pedido_feito' | 'chegou' | 'entregue' | 'desistiu';

export interface Encomenda {
  id: string;
  client_id: string | null;
  motorcycle_id: string | null;
  service_order_id: string | null;
  cotacao_item_id: string | null;
  cliente_nome: string;
  cliente_whatsapp: string | null;
  moto: string | null;
  peca: string;
  quantidade: number;
  origem: 'balcao' | 'whatsapp';
  urgente: boolean;
  status: StatusEncomenda;
  custo: number | null;
  preco_venda: number | null;
  prazo_texto: string | null;
  pago_adiantado: number;
  observacao: string | null;
  avisado_em: string | null;
  aprovado_em: string | null;
  pedido_em: string | null;
  chegou_em: string | null;
  entregue_em: string | null;
  desistiu_em: string | null;
  created_at: string;
}

export const STATUS_ENCOMENDA: Record<StatusEncomenda, { label: string; cls: string }> = {
  aguardando_cotacao: { label: 'Aguardando preço', cls: 'bg-yellow-500/15 text-yellow-600 border-yellow-500/30' },
  cliente_avisado: { label: 'Cliente avisado', cls: 'bg-blue-500/15 text-blue-600 border-blue-500/30' },
  aprovado: { label: 'Aprovado', cls: 'bg-purple-500/15 text-purple-600 border-purple-500/30' },
  pedido_feito: { label: 'Pedido feito', cls: 'bg-orange-500/15 text-orange-600 border-orange-500/30' },
  chegou: { label: 'Chegou', cls: 'bg-green-500/15 text-green-600 border-green-500/30' },
  entregue: { label: 'Entregue', cls: 'bg-muted text-muted-foreground border-border' },
  desistiu: { label: 'Desistiu', cls: 'bg-red-500/15 text-red-600 border-red-500/30' },
};

export const ATIVOS: StatusEncomenda[] = ['aguardando_cotacao', 'cliente_avisado', 'aprovado', 'pedido_feito', 'chegou'];

export type ModeloMensagem = 'orcamento' | 'ja_pedi' | 'chegou' | 'livre';

export function totalEncomenda(e: Pick<Encomenda, 'preco_venda' | 'quantidade'>) {
  return e.preco_venda != null ? Math.round(e.preco_venda * Number(e.quantidade) * 100) / 100 : null;
}

export function saldoEncomenda(e: Pick<Encomenda, 'preco_venda' | 'quantidade' | 'pago_adiantado'>) {
  const t = totalEncomenda(e);
  return t != null ? Math.max(0, Math.round((t - Number(e.pago_adiantado || 0)) * 100) / 100) : null;
}

export function primeiroNome(nome: string) {
  const n = nome.trim().split(/\s+/)[0] ?? '';
  return n ? n.charAt(0).toUpperCase() + n.slice(1).toLowerCase() : '';
}

export function mensagemCliente(
  modelo: ModeloMensagem,
  e: Pick<Encomenda, 'cliente_nome' | 'peca' | 'moto' | 'quantidade' | 'preco_venda' | 'pago_adiantado' | 'prazo_texto'>,
  incluirValor = false,
) {
  const n = primeiroNome(e.cliente_nome);
  const oi = n ? `Oi ${n}!` : 'Olá!';
  const peca = `${e.peca}${Number(e.quantidade) !== 1 ? ` (${Number(e.quantidade)})` : ''}`;
  const total = totalEncomenda(e);
  const saldo = saldoEncomenda(e);
  const prazo = e.prazo_texto?.trim();
  switch (modelo) {
    case 'orcamento':
      return `${oi} A peça ${peca}${e.moto ? ` da sua ${e.moto}` : ''} fica ${total != null ? brl(total) : '(valor)'}${prazo ? `, chega ${prazo}` : ''}. Posso pedir?`;
    case 'ja_pedi':
      return `${oi} Já pedi sua peça (${peca})${prazo ? `, chega ${prazo}` : ''}. Te aviso quando chegar!`;
    case 'chegou': {
      const valor = incluirValor && saldo != null && saldo > 0 ? ` Fica ${brl(saldo)} na retirada.` : '';
      return `${oi} Sua peça (${peca}) chegou!${valor} Pode vir buscar.`;
    }
    default:
      return `${oi} `;
  }
}

/** Último preço cobrado do cliente pra mesma peça (com ou sem acento), fora a própria encomenda. */
export function ultimoPrecoCobrado(todas: Encomenda[], e: Encomenda) {
  const k = normalizeSearch(e.peca).replace(/\s+/g, ' ');
  return todas
    .filter((x) => x.id !== e.id && x.preco_venda != null && normalizeSearch(x.peca).replace(/\s+/g, ' ') === k)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0] ?? null;
}

export function useEncomendas() {
  const qc = useQueryClient();
  const { storeId } = useStore();
  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ['encomendas'] });
    qc.invalidateQueries({ queryKey: ['cotacao'] });
  };

  const lista = useQuery({
    queryKey: ['encomendas'],
    queryFn: async () => {
      // Ativas + finalizadas dos últimos 120 dias
      const desde = new Date(Date.now() - 120 * 86_400_000).toISOString();
      const { data, error } = await db
        .from('encomendas')
        .select('*')
        .or(`status.in.(${ATIVOS.join(',')}),created_at.gte.${desde}`)
        .order('created_at', { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as Encomenda[];
    },
  });

  const onError = (e: Error) => toast.error(e.message);

  const criar = useMutation({
    mutationFn: async (p: {
      client_id: string | null; motorcycle_id: string | null; service_order_id: string | null;
      cliente_nome: string; cliente_whatsapp: string | null; moto: string | null;
      peca: string; quantidade: number; urgente: boolean; observacao: string | null;
    }) => {
      // A peça entra na lista de faltas da cotação, no jeito que a loja anota
      const { data: item, error: e1 } = await db
        .from('cotacao_itens')
        .insert({
          store_id: storeId,
          texto: p.peca,
          quantidade: p.quantidade,
          observacao: `Encomenda: ${p.cliente_nome}${p.moto ? ` · ${p.moto}` : ''}`,
        })
        .select('id')
        .single();
      if (e1) throw e1;
      const { data, error } = await db
        .from('encomendas')
        .insert({ ...p, store_id: storeId, cotacao_item_id: item.id })
        .select('*')
        .single();
      if (error) {
        await db.from('cotacao_itens').delete().eq('id', item.id);
        throw error;
      }
      return data as Encomenda;
    },
    onSuccess: () => { invalidar(); toast.success('Encomenda registrada'); },
    onError,
  });

  const atualizar = useMutation({
    mutationFn: async ({ id, ...campos }: Partial<Encomenda> & { id: string }) => {
      const { error } = await db.from('encomendas').update(campos).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidar,
    onError,
  });

  /** Muda o status e grava a data da etapa. Também mantém a peça da cotação coerente. */
  const mudarStatus = useMutation({
    mutationFn: async ({ e, status }: { e: Encomenda; status: StatusEncomenda }) => {
      const agora = new Date().toISOString();
      const datas: Partial<Record<keyof Encomenda, string>> = {
        cliente_avisado: { avisado_em: agora },
        aprovado: { aprovado_em: agora },
        pedido_feito: { pedido_em: agora },
        chegou: { chegou_em: agora },
        entregue: { entregue_em: agora },
        desistiu: { desistiu_em: agora },
        aguardando_cotacao: {},
      }[status] as Partial<Record<keyof Encomenda, string>>;
      const { error } = await db.from('encomendas').update({ status, ...datas }).eq('id', e.id);
      if (error) throw error;

      if (e.cotacao_item_id) {
        if (status === 'pedido_feito') {
          await db.from('cotacao_itens').update({ status: 'pedido', pedido_em: agora }).eq('id', e.cotacao_item_id).eq('status', 'pendente');
        }
        if (status === 'desistiu') {
          // Ainda não foi pedida: tira da lista de faltas. Já pedida: a peça fica pra loja.
          await db.from('cotacao_itens').update({ status: 'cancelado' }).eq('id', e.cotacao_item_id).eq('status', 'pendente');
        }
      }
    },
    onSuccess: (_d, { status, e }) => {
      invalidar();
      if (status === 'desistiu' && (e.status === 'pedido_feito' || e.status === 'chegou')) {
        toast.info('A peça já foi pedida: ela fica pro estoque da loja.');
      }
    },
    onError,
  });

  const excluir = useMutation({
    mutationFn: async (e: Encomenda) => {
      const { error } = await db.from('encomendas').delete().eq('id', e.id);
      if (error) throw error;
      if (e.cotacao_item_id) {
        await db.from('cotacao_itens').delete().eq('id', e.cotacao_item_id).eq('status', 'pendente');
      }
    },
    onSuccess: () => { invalidar(); toast.success('Encomenda excluída'); },
    onError,
  });

  return {
    encomendas: lista.data ?? [],
    carregando: lista.isLoading,
    criar,
    atualizar,
    mudarStatus,
    excluir,
  };
}
