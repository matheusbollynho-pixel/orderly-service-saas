// Preço por tipo de cliente (Lojista, Lava-jato...). Usado na nota de balcão.

export interface TipoCliente {
  id: string;
  nome: string;
  desconto_pct: number;
  usa_preco_atacado: boolean;
  validade_dias: number | null;
  compra_minima: number;
  ativo: boolean;
  /** Peças do estoque na OS saem com o preço do tipo */
  vale_pecas_os?: boolean;
  /** Serviço (mão de obra) na OS sai com o desconto % */
  vale_servico_os?: boolean;
}

/** Hoje no fuso da loja (AAAA-MM-DD) */
export const hojeISO = (agora = new Date()) => new Date(agora.getTime() - 3 * 3600e3).toISOString().slice(0, 10);

export const somarDias = (iso: string, dias: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};

/** O tipo vale hoje? (sem validade = não vence) */
export function tipoEmDia(tipo: TipoCliente | null | undefined, validoAte: string | null | undefined, hoje = hojeISO()): boolean {
  if (!tipo || !tipo.ativo) return false;
  if (!tipo.validade_dias) return true;
  return !!validoAte && validoAte >= hoje;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Preço do produto para o cliente. tipo = null → preço normal. */
export function precoParaCliente(
  p: { sale_price: number | null; preco_atacado?: number | null },
  tipo: TipoCliente | null | undefined,
): number {
  const normal = Number(p.sale_price) || 0;
  if (!tipo) return normal;
  const atacado = Number(p.preco_atacado) || 0;
  if (tipo.usa_preco_atacado && atacado > 0) return r2(atacado);
  const pct = Number(tipo.desconto_pct) || 0;
  if (pct > 0) return r2(normal * (1 - pct / 100));
  return normal;
}

/** Valor do serviço da OS para o cliente (só o desconto %, se o tipo vale no serviço) */
export function servicoParaCliente(valor: number, tipo: TipoCliente | null | undefined): number {
  const pct = Number(tipo?.desconto_pct) || 0;
  if (!tipo || !tipo.vale_servico_os || pct <= 0) return valor;
  return r2(valor * (1 - pct / 100));
}

/** Onde o preço do tipo vale */
export function ondeVale(t: TipoCliente): string {
  const onde = ['balcão'];
  if (t.vale_pecas_os !== false) onde.push('peças da OS');
  if (t.vale_servico_os && t.desconto_pct > 0) onde.push('serviço da OS');
  return 'Vale em: ' + onde.join(', ');
}

/** Texto curto do que o tipo dá */
export function regraDoTipo(t: TipoCliente): string {
  const partes: string[] = [];
  if (t.usa_preco_atacado) partes.push(t.desconto_pct > 0 ? `preço de atacado (sem ele, ${t.desconto_pct}% off)` : 'preço de atacado');
  else if (t.desconto_pct > 0) partes.push(`${t.desconto_pct}% de desconto`);
  else partes.push('sem desconto');
  if (t.validade_dias) partes.push(`vale ${t.validade_dias} dias${t.compra_minima > 0 ? `, renova com compra a partir de ${t.compra_minima.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` : ', renova a cada compra'}`);
  return partes.join(' · ');
}

export const fmtCpf = (v: string | null | undefined) => {
  const d = String(v ?? '').replace(/\D/g, '');
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return v ?? '';
};
