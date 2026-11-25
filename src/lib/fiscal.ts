// Notas fiscais no app: rótulos, cores e links do PDF/XML (abrem direto no fornecedor, sem chave).
// A emissão/cancelamento passa SEMPRE pela função `fiscal` do servidor.
import { supabase } from '@/integrations/supabase/client';

export type StatusNota = 'enviando' | 'processando' | 'autorizada' | 'rejeitada' | 'denegada' | 'cancelada' | 'contingencia' | 'erro' | 'inutilizada';
export type ModeloNota = 'nfce' | 'nfe' | 'nfse';

export interface NotaFiscal {
  id: string;
  modelo: ModeloNota;
  origem: 'balcao' | 'os' | 'site' | 'manual';
  balcao_order_id: string | null;
  order_id: string | null;
  ambiente: 'sandbox' | 'producao';
  fornecedor_nota_id: string | null;
  status: StatusNota;
  numero: number | null;
  serie: string | null;
  chave: string | null;
  valor: number | null;
  cpf_cnpj_cliente: string | null;
  motivo: string | null;
  autorizada_em: string | null;
  cancelada_em: string | null;
  cancel_motivo: string | null;
  created_at: string;
}

export const NOME_MODELO: Record<ModeloNota, string> = { nfce: 'NFC-e (cupom)', nfe: 'NF-e', nfse: 'NFS-e (serviço)' };

export const STATUS_NOTA: Record<StatusNota, { nome: string; cor: string }> = {
  enviando: { nome: 'Enviando', cor: 'text-amber-500' },
  processando: { nome: 'Processando', cor: 'text-amber-500' },
  contingencia: { nome: 'Em contingência', cor: 'text-amber-500' },
  autorizada: { nome: 'Autorizada', cor: 'text-emerald-500' },
  rejeitada: { nome: 'Rejeitada', cor: 'text-red-500' },
  denegada: { nome: 'Denegada', cor: 'text-red-500' },
  erro: { nome: 'Erro no envio', cor: 'text-red-500' },
  cancelada: { nome: 'Cancelada', cor: 'text-muted-foreground' },
  inutilizada: { nome: 'Recusada · número inutilizado', cor: 'text-muted-foreground' },
};

export const emAndamento = (s: StatusNota) => s === 'enviando' || s === 'processando' || s === 'contingencia';

const base = (amb: NotaFiscal['ambiente']) => (amb === 'producao' ? 'https://api.spedy.com.br/v1' : 'https://sandbox-api.spedy.com.br/v1');
const caminho: Record<ModeloNota, string> = { nfce: 'consumer-invoices', nfe: 'product-invoices', nfse: 'service-invoices' };

export const urlPdf = (n: NotaFiscal) => (n.fornecedor_nota_id ? `${base(n.ambiente)}/${caminho[n.modelo]}/${n.fornecedor_nota_id}/pdf` : null);
export const urlXml = (n: NotaFiscal) => (n.fornecedor_nota_id ? `${base(n.ambiente)}/${caminho[n.modelo]}/${n.fornecedor_nota_id}/xml` : null);

/** Chama a função do servidor e devolve o erro já em português. */
export async function chamarFiscal<T = Record<string, unknown>>(corpo: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('fiscal', { body: corpo });
  if (error) {
    // Erro HTTP: a mensagem útil vem no corpo da resposta
    let msg = error.message;
    try { const j = await (error as { context?: Response }).context?.json(); if (j?.error) msg = j.error; } catch { /* mantém */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

/** Junta números em faixas seguidas: [1,2,3,5,7,8] → [[1,3],[5,5],[7,8]] (uma inutilização por faixa). */
export function faixasSeguidas(nums: number[]): [number, number][] {
  const ord = [...new Set(nums.filter((n) => Number.isFinite(n) && n > 0))].sort((a, b) => a - b);
  const out: [number, number][] = [];
  for (const n of ord) {
    const ult = out[out.length - 1];
    if (ult && n === ult[1] + 1) ult[1] = n; else out.push([n, n]);
  }
  return out;
}
export const textoFaixa = ([de, ate]: [number, number]) => (de === ate ? `${de}` : `${de} a ${ate}`);

/** Dias até o certificado vencer (negativo = vencido; null = sem data). */
export function diasParaVencer(validade: string | null | undefined, hoje = new Date()): number | null {
  if (!validade) return null;
  const v = new Date(validade);
  if (Number.isNaN(v.getTime())) return null;
  return Math.floor((v.getTime() - hoje.getTime()) / 86_400_000);
}
