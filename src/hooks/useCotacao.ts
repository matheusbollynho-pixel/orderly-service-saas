import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useStore } from '@/contexts/StoreContext';

// As tabelas da cotação ainda não estão no types.ts gerado.
const db = supabase as unknown as SupabaseClient;

export type PerfilRep = 'original' | 'popular' | 'marca_propria';
export type EntregaExtra = 'van' | 'onibus' | 'transportadora' | 'outro';
export type Situacao = 'cotado' | 'nao_tem' | 'duvida' | 'nao_serve';
export type PrecoPor = 'unidade' | 'par' | 'kit' | 'nao_informado';

export interface Representante {
  id: string;
  store_id: string;
  nome: string;
  whatsapp: string | null;
  perfil: PerfilRep | null;
  entrega_dia_semana: number | null;
  entrega_quinzenal: boolean;
  entrega_quinzenal_ref: string | null;
  pedido_minimo: number | null;
  prazo_dias: number | null;
  horario_corte: string | null;
  entrega_extra: EntregaExtra | null;
  frete_extra_valor: number | null;
  tem_tabela: boolean;
  tabela_atualizada_em: string | null;
  observacoes: string | null;
  ativo: boolean;
}

export interface CotacaoItem {
  id: string;
  texto: string;
  quantidade: number;
  status: 'pendente' | 'pedido' | 'cancelado';
  observacao: string | null;
  pedido_preco_id: string | null;
  pedido_em: string | null;
  created_at: string;
}

export interface CotacaoPreco {
  id: string;
  item_id: string | null;
  resposta_id: string | null;
  representante_id: string | null;
  fonte: 'representante' | 'internet';
  loja_internet: string | null;
  link: string | null;
  texto_original: string | null;
  situacao: Situacao;
  marca: string | null;
  preco: number | null;
  frete: number | null;
  preco_por: PrecoPor;
  motivo: string | null;
  confirmado: boolean;
  created_at: string;
}

export interface CotacaoResposta {
  id: string;
  representante_id: string | null;
  texto: string | null;
  arquivo_nome: string | null;
  prazo_entrega: string | null;
  condicao_frete: string | null;
  created_at: string;
}

export interface RegraDicionario {
  id: string;
  regra: string;
  created_at: string;
}

const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

export function brl(n: number | null | undefined) {
  if (n == null) return '-';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function diasAtras(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (d <= 0) return 'hoje';
  if (d === 1) return 'ontem';
  return `há ${d} dias`;
}

function dataCurta(d: Date) {
  return `${DIAS[d.getDay()].slice(0, 3)} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function passouDoCorte(agora: Date, corte: string | null) {
  if (!corte) return false;
  const [h, m] = corte.split(':').map(Number);
  return agora.getHours() * 60 + agora.getMinutes() >= h * 60 + (m || 0);
}

/** Próximo dia de entrega grátis (dia fixo semanal ou quinzenal). */
export function proximaEntregaGratis(rep: Representante, agora = new Date()): Date | null {
  if (rep.entrega_dia_semana == null) return null;
  const base = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const ref = rep.entrega_quinzenal && rep.entrega_quinzenal_ref
    ? new Date(`${rep.entrega_quinzenal_ref}T00:00:00`)
    : null;
  for (let i = 0; i < 21; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    if (d.getDay() !== rep.entrega_dia_semana) continue;
    if (i === 0 && passouDoCorte(agora, rep.horario_corte)) continue;
    if (ref) {
      const semanas = Math.round((d.getTime() - ref.getTime()) / (7 * 86_400_000));
      if (semanas % 2 !== 0) continue;
    }
    return d;
  }
  return null;
}

/** Resumo curto de como e quando o representante entrega. */
export function resumoEntrega(rep: Representante, agora = new Date()): string[] {
  const linhas: string[] = [];
  const gratis = proximaEntregaGratis(rep, agora);
  if (gratis) linhas.push(`Grátis: ${dataCurta(gratis)}${rep.entrega_quinzenal ? ' (quinzenal)' : ''}`);
  else if (rep.entrega_dia_semana != null && rep.entrega_quinzenal) linhas.push(`Grátis toda ${DIAS[rep.entrega_dia_semana]}, semana sim/não (falta a data de referência)`);
  if (rep.pedido_minimo != null) {
    linhas.push(`Grátis acima de ${brl(rep.pedido_minimo)}${rep.prazo_dias != null ? `, ${rep.prazo_dias} dia(s)` : ''}`);
  }
  if (rep.entrega_extra) {
    const nome = { van: 'Van', onibus: 'Ônibus', transportadora: 'Transportadora', outro: 'Outro' }[rep.entrega_extra];
    let quando = '';
    if (rep.prazo_dias != null) {
      const d = new Date(agora);
      const extra = rep.prazo_dias === 0 && passouDoCorte(agora, rep.horario_corte) ? 1 : rep.prazo_dias;
      d.setDate(d.getDate() + extra);
      quando = extra === 0 ? ' chega hoje' : ` chega ${dataCurta(d)}`;
    }
    linhas.push(`${nome}:${quando} ${rep.frete_extra_valor != null ? `+ ${brl(rep.frete_extra_valor)}` : '(frete a combinar)'}`);
  }
  if (!linhas.length && rep.prazo_dias != null) linhas.push(`Prazo: ${rep.prazo_dias} dia(s)`);
  if (rep.horario_corte) linhas.push(`Pedir até ${rep.horario_corte.slice(0, 5)}`);
  return linhas;
}

export function normalizarWhats(tel: string | null | undefined) {
  const d = (tel ?? '').replace(/\D/g, '');
  if (!d) return '';
  return d.startsWith('55') && d.length >= 12 ? d : `55${d}`;
}

export function linkWhats(tel: string | null | undefined, texto: string) {
  const n = normalizarWhats(tel);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(texto)}` : `https://wa.me/?text=${encodeURIComponent(texto)}`;
}

export function mensagemCotacao(itens: Pick<CotacaoItem, 'texto' | 'quantidade'>[]) {
  const linhas = itens.map((i) => `- ${i.texto}${Number(i.quantidade) !== 1 ? ` (${Number(i.quantidade)})` : ''}`);
  return `Bom dia! Preciso dessas peças, consegue me passar preço e prazo? Se puder mandar escrito ou foto, fico agradecido.\n\n${linhas.join('\n')}`;
}

export function linksInternet(texto: string) {
  const q = encodeURIComponent(texto);
  return {
    mercadoLivre: `https://lista.mercadolivre.com.br/${encodeURIComponent(texto.trim().replace(/\s+/g, '-'))}`,
    shopee: `https://shopee.com.br/search?keyword=${q}`,
  };
}

const ORDEM_SITUACAO: Record<Situacao, number> = { cotado: 0, duvida: 1, nao_tem: 2, nao_serve: 3 };

export function ordenarOpcoes(opcoes: CotacaoPreco[]) {
  return [...opcoes].sort((a, b) => {
    const s = ORDEM_SITUACAO[a.situacao] - ORDEM_SITUACAO[b.situacao];
    if (s !== 0) return s;
    const pa = (a.preco ?? Infinity) + (a.frete ?? 0);
    const pb = (b.preco ?? Infinity) + (b.frete ?? 0);
    return pa - pb;
  });
}

// ------------------------------------------------------------------

export function useCotacao() {
  const qc = useQueryClient();
  const { storeId } = useStore();
  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ['cotacao'] });
    // Pedido/escolha na cotação mexe na encomenda ligada (gatilho no banco)
    qc.invalidateQueries({ queryKey: ['encomendas'] });
  };

  const representantes = useQuery({
    queryKey: ['cotacao', 'representantes'],
    queryFn: async () => {
      const { data, error } = await db.from('representantes').select('*').order('nome');
      if (error) throw error;
      return (data ?? []) as Representante[];
    },
  });

  const itens = useQuery({
    queryKey: ['cotacao', 'itens'],
    queryFn: async () => {
      // Pendentes + os últimos 60 dias de pedidos/cancelados
      const desde = new Date(Date.now() - 60 * 86_400_000).toISOString();
      const { data, error } = await db
        .from('cotacao_itens')
        .select('*')
        .or(`status.eq.pendente,created_at.gte.${desde}`)
        .order('created_at', { ascending: true })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as CotacaoItem[];
    },
  });

  const precos = useQuery({
    queryKey: ['cotacao', 'precos'],
    queryFn: async () => {
      const desde = new Date(Date.now() - 90 * 86_400_000).toISOString();
      const { data, error } = await db
        .from('cotacao_precos')
        .select('*')
        .gte('created_at', desde)
        .order('created_at', { ascending: false })
        .limit(3000);
      if (error) throw error;
      return (data ?? []) as CotacaoPreco[];
    },
  });

  const respostas = useQuery({
    queryKey: ['cotacao', 'respostas'],
    queryFn: async () => {
      const { data, error } = await db
        .from('cotacao_respostas')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as CotacaoResposta[];
    },
  });

  const dicionario = useQuery({
    queryKey: ['cotacao', 'dicionario'],
    queryFn: async () => {
      const { data, error } = await db.from('cotacao_dicionario').select('*').order('created_at');
      if (error) throw error;
      return (data ?? []) as RegraDicionario[];
    },
  });

  const onError = (e: Error) => toast.error(e.message);

  const adicionarItens = useMutation({
    mutationFn: async (linhas: { texto: string; quantidade: number }[]) => {
      const { error } = await db.from('cotacao_itens').insert(linhas.map((l) => ({ ...l, store_id: storeId })));
      if (error) throw error;
    },
    onSuccess: () => { invalidar(); toast.success('Adicionado na lista de faltas'); },
    onError,
  });

  const atualizarItem = useMutation({
    mutationFn: async ({ id, ...campos }: Partial<CotacaoItem> & { id: string }) => {
      const { error } = await db.from('cotacao_itens').update(campos).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidar,
    onError,
  });

  const excluirItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from('cotacao_itens').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { invalidar(); toast.success('Item excluído'); },
    onError,
  });

  const salvarRepresentante = useMutation({
    mutationFn: async (rep: Partial<Representante>) => {
      const { id, store_id: _s, ...campos } = rep;
      const q = id
        ? db.from('representantes').update(campos).eq('id', id)
        : db.from('representantes').insert({ ...campos, store_id: storeId });
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => { invalidar(); toast.success('Representante salvo'); },
    onError,
  });

  const excluirRepresentante = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from('representantes').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { invalidar(); toast.success('Representante excluído'); },
    onError,
  });

  const lerResposta = useMutation({
    mutationFn: async (payload: {
      representante_id: string | null;
      texto: string;
      arquivo: { nome: string; tipo: string; base64: string } | null;
    }) => {
      const { data, error } = await supabase.functions.invoke('cotacao-ler-resposta', { body: payload });
      if (error) {
        // Erro de negócio vem no corpo da resposta
        let msg = error.message;
        try {
          const ctx = (error as { context?: Response }).context;
          if (ctx) msg = (await ctx.json())?.error ?? msg;
        } catch { /* mantém a mensagem padrão */ }
        throw new Error(msg);
      }
      return data as { resposta_id: string; total: number; sem_item: number; duvidas: number };
    },
    onSuccess: invalidar,
    onError,
  });

  const atualizarPreco = useMutation({
    mutationFn: async ({ id, ...campos }: Partial<CotacaoPreco> & { id: string }) => {
      const { error } = await db.from('cotacao_precos').update(campos).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidar,
    onError,
  });

  const adicionarPrecoInternet = useMutation({
    mutationFn: async (p: { item_id: string; loja_internet: string; preco: number; frete: number | null; marca: string | null; link: string | null }) => {
      const { error } = await db.from('cotacao_precos').insert({
        ...p,
        store_id: storeId,
        fonte: 'internet',
        situacao: 'cotado',
        preco_por: 'unidade',
        confirmado: true,
      });
      if (error) throw error;
    },
    onSuccess: () => { invalidar(); toast.success('Preço da internet adicionado'); },
    onError,
  });

  const excluirPreco = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from('cotacao_precos').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidar,
    onError,
  });

  const adicionarRegra = useMutation({
    mutationFn: async (regra: string) => {
      const { error } = await db.from('cotacao_dicionario').insert({ regra, store_id: storeId });
      if (error) throw error;
    },
    onSuccess: () => { invalidar(); toast.success('A IA aprendeu essa regra'); },
    onError,
  });

  const excluirRegra = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from('cotacao_dicionario').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidar,
    onError,
  });

  return {
    representantes: representantes.data ?? [],
    itens: itens.data ?? [],
    precos: precos.data ?? [],
    respostas: respostas.data ?? [],
    dicionario: dicionario.data ?? [],
    carregando: representantes.isLoading || itens.isLoading || precos.isLoading,
    adicionarItens,
    atualizarItem,
    excluirItem,
    salvarRepresentante,
    excluirRepresentante,
    lerResposta,
    atualizarPreco,
    adicionarPrecoInternet,
    excluirPreco,
    adicionarRegra,
    excluirRegra,
  };
}
