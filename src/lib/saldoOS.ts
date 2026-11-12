// Saldo de uma OS: soma das peças/serviços menos pagamentos e descontos.
// (Mesma conta que OrderDetails e Relatórios › Pagtos fazem; aqui num lugar só.)
interface MaterialMin { valor?: number | null; quantidade?: string | number | null }
interface PagamentoMin { amount?: number | null; discount_amount?: number | null }

export function saldoOS(order: { materials?: MaterialMin[] | null; payments?: PagamentoMin[] | null }) {
  const total = (order.materials || []).reduce((s, m) => s + (Number(m.valor) || 0) * (parseFloat(String(m.quantidade ?? '')) || 0), 0);
  const pago = (order.payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const desconto = (order.payments || []).reduce((s, p) => s + (Number(p.discount_amount) || 0), 0);
  const falta = Math.max(Math.round((total - pago - desconto) * 100) / 100, 0);
  return { total, pago, desconto, falta };
}

/** Saldo de um fiado: valor + juros − pago (nunca negativo). */
export function saldoFiado(f: { original_amount?: number | null; interest_accrued?: number | null; amount_paid?: number | null }) {
  const v = (Number(f.original_amount) || 0) + (Number(f.interest_accrued) || 0) - (Number(f.amount_paid) || 0);
  return Math.max(Math.round(v * 100) / 100, 0);
}
