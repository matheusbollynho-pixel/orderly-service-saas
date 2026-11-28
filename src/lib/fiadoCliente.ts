// Situação do fiado de um cliente: em aberto, atrasado e quanto ainda cabe no limite.
type Num = number | string | null | undefined;
const n = (v: Num) => Number(v) || 0;

export interface FiadoAberto { original_amount: Num; interest_accrued: Num; amount_paid: Num; due_date: string | null; status: string }
export interface SituacaoFiado {
  aprovado: boolean; limite: number | null;
  aberto: number; atrasado: number; qtdAtrasados: number; disponivel: number | null;
}

export function situacaoFiado(cliente: { fiado_aprovado?: boolean | null; fiado_limite?: Num } | null, fiados: FiadoAberto[], hoje: string): SituacaoFiado {
  let aberto = 0, atrasado = 0, qtdAtrasados = 0;
  for (const f of fiados) {
    if (f.status === 'pago') continue;
    const falta = Math.max(n(f.original_amount) + n(f.interest_accrued) - n(f.amount_paid), 0);
    aberto += falta;
    if (falta > 0.004 && f.due_date && f.due_date < hoje) { atrasado += falta; qtdAtrasados++; }
  }
  const r = (v: number) => Math.round(v * 100) / 100;
  const limite = cliente?.fiado_limite != null && cliente.fiado_limite !== '' ? n(cliente.fiado_limite) : null;
  return {
    aprovado: !!cliente?.fiado_aprovado, limite,
    aberto: r(aberto), atrasado: r(atrasado), qtdAtrasados,
    disponivel: limite == null ? null : r(Math.max(limite - aberto, 0)),
  };
}
