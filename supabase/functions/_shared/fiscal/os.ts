// OS → itens da nota de VENDA (NFC-e / NF-e): só as PEÇAS. Mão de obra vai na nota de serviço (NFS-e), à parte.
// Sem nada de Deno: testado no vitest.

export interface MaterialOs { descricao: string | null; quantidade: string | number | null; valor: number | string | null; is_service: boolean | null; product_id: string | null }
export interface PagamentoOs { method: string | null; amount: number | string | null; discount_amount: number | string | null }

const r2 = (v: number) => Math.round(v * 100) / 100

/** "2", "1,5", "2 un", "0.5 lt" → número (texto livre da OS). */
export function qtdDoTexto(t: string | number | null | undefined): number {
  if (typeof t === 'number') return t
  const m = String(t ?? '').trim().replace(',', '.').match(/^-?(?:\d+(?:\.\d*)?|\.\d+)/)
  return m ? Number(m[0]) : 0
}

/**
 * Peças da OS e a parte do desconto que cabe a elas (o desconto da OS é dividido entre peças e serviço
 * pelo peso de cada um — mesma regra do relatório de notas de serviço).
 */
export function pecasDaOs(materiais: MaterialOs[], pagamentos: PagamentoOs[]) {
  const linhas = materiais.map((m) => ({ m, qtd: qtdDoTexto(m.quantidade), unit: Number(m.valor) || 0 }))
    .filter((x) => x.qtd > 0 && x.unit > 0)
  const total = r2(linhas.reduce((s, x) => s + x.qtd * x.unit, 0))
  const pecas = linhas.filter((x) => !x.m.is_service)
  const brutoPecas = r2(pecas.reduce((s, x) => s + x.qtd * x.unit, 0))
  const desconto = r2(pagamentos.reduce((s, p) => s + (Number(p.discount_amount) || 0), 0))
  const descontoPecas = total > 0 ? Math.min(r2(desconto * (brutoPecas / total)), brutoPecas) : 0
  // Forma principal primeiro (maior valor): a nota de peças usa a forma de quem pagou mais
  const formas = pagamentos.filter((p) => Number(p.amount) > 0)
    .sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0))
    .map((p) => ({ forma: p.method || 'dinheiro', valor: Number(p.amount) || 0 }))
  return {
    linhas: pecas.map((x) => ({ description: String(x.m.descricao ?? '').trim() || 'PEÇA', quantity: x.qtd, unit_price: x.unit, product_id: x.m.product_id })),
    brutoPecas,
    descontoPecas,
    formas,
    temServico: linhas.some((x) => x.m.is_service),
  }
}
