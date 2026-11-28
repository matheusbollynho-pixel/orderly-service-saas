// Texto do resumo financeiro (WhatsApp do dono e prévia no app). Sem nada de Deno: roda no servidor,
// no app e nos testes. Os números vêm prontos da função financeiro_resumo do banco; aqui só se escreve.

type Num = number | string | null | undefined
const n = (v: Num) => Number(v) || 0

export interface ResumoBase {
  caixa: {
    entradas: Num; saidas: Num; retiradas: Num
    entradas_os?: Num; entradas_notas?: Num; entradas_fiado?: Num; entradas_estorno?: Num
  }
  os: { qtd: Num; total: Num; desconto: Num; a_receber: Num }
  notas: { qtd: Num; total: Num; no_fiado: Num }
  fiado_vencido: { qtd: Num; valor: Num }
}
export interface DadosFinanceiro {
  periodo: { ini: string; fim: string; dias: Num }
  resumo: ResumoBase
  anterior: ResumoBase
  por_forma: { forma: string; valor: Num }[]
  pecas: { faturamento: Num; custo: Num; sem_custo_produtos: Num; sem_custo_valor: Num } | null
  abaixo_custo: { produto: string; preco: Num; custo: Num; qtd: Num }[]
  caixa_diferencas: { fechado_em: string; quem: string | null; diferenca: Num }[]
  caixa_aberto_desde: string | null
  contas_proximas: { vencidas_qtd: Num; vencidas_valor: Num; proximas_qtd: Num; proximas_valor: Num } | null
}

export const brl = (v: Num) => {
  const x = n(v)
  const [i, d] = Math.abs(x).toFixed(2).split('.')
  return `${x < 0 ? '−' : ''}R$ ${i.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${d}`
}
const data = (iso: string) => { const [, m, d] = iso.slice(0, 10).split('-'); return `${d}/${m}` }
const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const diaSemana = (iso: string) => DIAS[new Date(`${iso.slice(0, 10)}T12:00:00Z`).getUTCDay()]
const FORMAS: Record<string, string> = {
  dinheiro: 'Dinheiro', pix: 'Pix', cartao: 'Cartão', credito: 'Crédito', debito: 'Débito',
  cartao_credito: 'Crédito', cartao_debito: 'Débito', transferencia: 'Transferência', outro: 'Outros', outros: 'Outros',
}
const plural = (q: number, um: string, varios: string) => `${q} ${q === 1 ? um : varios}`

/** Entrada lançada à mão no caixa, sem OS, nota ou fiado (muita loja registra a venda de balcão assim).
 *  Mesma conta do "Lançado à mão" do Resumo dos Relatórios. */
export const lancadoAMao = (r: ResumoBase) => Math.max(Math.round((n(r.caixa.entradas) - n(r.caixa.entradas_os) - n(r.caixa.entradas_notas)
  - n(r.caixa.entradas_fiado) - n(r.caixa.entradas_estorno)) * 100) / 100, 0)
/** Vendeu no período = OS entregues (menos desconto) + vendas do balcão + lançado à mão no caixa. */
export const vendeu = (r: ResumoBase) => n(r.os.total) - n(r.os.desconto) + n(r.notas.total) + lancadoAMao(r)

/** "+12%", "−5%", "igual" ou null quando não dá para comparar (período anterior zerado). */
export function variacao(atual: number, anterior: number): string | null {
  if (Math.abs(anterior) < 0.005) return null
  const p = Math.round(((atual - anterior) / Math.abs(anterior)) * 100)
  if (p === 0) return 'igual'
  return `${p > 0 ? '+' : '−'}${Math.abs(p)}%`
}

/** Monta a mensagem. Devolve null quando não houve movimento nem nada para avisar (não manda mensagem vazia). */
export function montarResumoFinanceiro(d: DadosFinanceiro, loja: string, tipo: 'diario' | 'semanal'): string | null {
  const r = d.resumo
  const total = vendeu(r)
  const ant = vendeu(d.anterior)
  const entradas = n(r.caixa.entradas), saidas = n(r.caixa.saidas), retiradas = n(r.caixa.retiradas)

  const alertas: string[] = []
  for (const c of d.caixa_diferencas ?? []) {
    const dif = n(c.diferenca)
    alertas.push(`• Caixa fechado com ${dif < 0 ? 'falta' : 'sobra'} de ${brl(Math.abs(dif))}${c.quem ? ` (${c.quem})` : ''}${tipo === 'semanal' ? ` em ${data(c.fechado_em)}` : ''}`)
  }
  if (d.caixa_aberto_desde) alertas.push(`• Caixa aberto desde ${data(d.caixa_aberto_desde)}: feche antes de abrir o de hoje`)
  const fv = r.fiado_vencido
  if (n(fv.qtd) > 0) alertas.push(`• ${plural(n(fv.qtd), 'fiado vencido', 'fiados vencidos')}: ${brl(fv.valor)}`)
  const cp = d.contas_proximas
  if (cp && n(cp.vencidas_qtd) > 0) alertas.push(`• ${plural(n(cp.vencidas_qtd), 'conta vencida', 'contas vencidas')} sem pagar: ${brl(cp.vencidas_valor)}`)
  if (cp && n(cp.proximas_qtd) > 0) alertas.push(`• ${plural(n(cp.proximas_qtd), 'conta vence', 'contas vencem')} nos próximos 2 dias: ${brl(cp.proximas_valor)}`)
  for (const a of d.abaixo_custo ?? []) {
    alertas.push(`• Vendido abaixo do custo: ${a.produto} por ${brl(a.preco)} (custo ${brl(a.custo)})${n(a.qtd) > 1 ? ` × ${Number(n(a.qtd).toFixed(3))}` : ''}`)
  }

  const semMovimento = Math.abs(total) < 0.005 && Math.abs(entradas) < 0.005 && Math.abs(saidas) < 0.005 && Math.abs(retiradas) < 0.005
  if (semMovimento && !alertas.length) return null

  const L: string[] = []
  if (tipo === 'diario') {
    L.push(`📊 *Fechamento do dia · ${loja}*`, `${diaSemana(d.periodo.ini)}, ${data(d.periodo.ini)}`)
  } else {
    L.push(`📊 *Resumo da semana · ${loja}*`, `${data(d.periodo.ini)} a ${data(d.periodo.fim)}`)
  }
  L.push('')

  if (semMovimento) {
    L.push(tipo === 'diario' ? 'Sem vendas nem movimento no caixa hoje.' : 'Sem vendas nem movimento no caixa na semana.')
  } else {
    const comp = variacao(total, ant)
    const contra = tipo === 'diario' ? `${diaSemana(d.periodo.ini)} passada` : 'semana anterior'
    L.push(`*Vendeu:* ${brl(total)}${comp ? ` (${comp === 'igual' ? 'igual à' : `${comp} vs`} ${contra})` : ''}`)
    const qOs = n(r.os.qtd), qNotas = n(r.notas.qtd)
    if (qOs) L.push(`• ${plural(qOs, 'OS entregue', 'OS entregues')}: ${brl(n(r.os.total) - n(r.os.desconto))}`)
    if (qNotas) L.push(`• ${plural(qNotas, 'venda no balcão', 'vendas no balcão')}: ${brl(r.notas.total)}`)
    const aMao = lancadoAMao(r)
    if (aMao >= 0.01) L.push(`• Lançado à mão no caixa: ${brl(aMao)}`)
    const aReceber = n(r.os.a_receber) + n(r.notas.no_fiado)
    if (aReceber >= 0.01) L.push(`• Ficou a receber (fiado/pendente): ${brl(aReceber)}`)

    L.push('', `*Entrou no caixa:* ${brl(entradas)}`)
    const formas = (d.por_forma ?? []).filter((f) => Math.abs(n(f.valor)) >= 0.01)
    if (formas.length) L.push(formas.map((f) => `${FORMAS[f.forma] ?? f.forma} ${brl(f.valor)}`).join(' · '))
    if (saidas >= 0.01) L.push(`*Saiu (despesas):* ${brl(saidas)}`)
    if (retiradas >= 0.01) L.push(`*Retiradas:* ${brl(retiradas)}`)
    L.push(`*Saldo:* ${brl(entradas - saidas)} (entradas − saídas)`)

    const pc = d.pecas
    if (pc && n(pc.faturamento) >= 0.01) {
      const lucro = n(pc.faturamento) - n(pc.custo)
      const margem = Math.round((lucro / n(pc.faturamento)) * 100)
      L.push('', `*Peças do estoque:* vendeu ${brl(pc.faturamento)}, custo ${brl(pc.custo)}`, `*Lucro bruto das peças:* ${brl(lucro)} (${margem}%)`)
    }
    if (pc && n(pc.sem_custo_produtos) > 0) {
      const um = n(pc.sem_custo_produtos) === 1
      L.push(`_${plural(n(pc.sem_custo_produtos), 'produto vendido está', 'produtos vendidos estão')} sem preço de custo (${brl(pc.sem_custo_valor)}) e ${um ? 'ficou' : 'ficaram'} fora do lucro._`)
    }
  }

  if (alertas.length) L.push('', '⚠️ *Atenção*', ...alertas)
  L.push('', 'Detalhes: Relatórios › Resumo')
  return L.join('\n')
}

/** Hoje no fuso da loja (−03:00), 'AAAA-MM-DD'. */
export function hojeLoja(agora = Date.now()): string { return new Date(agora - 3 * 3600_000).toISOString().slice(0, 10) }
const somarDias = (iso: string, dias: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10)

/** Período do resumo: diário = hoje; semanal = segunda a domingo da semana passada. */
export function periodoDoResumo(tipo: 'diario' | 'semanal', hoje: string): { ini: string; fim: string } {
  if (tipo === 'diario') return { ini: hoje, fim: hoje }
  const dow = new Date(`${hoje}T12:00:00Z`).getUTCDay() // 0 = domingo
  const segundaDestaSemana = somarDias(hoje, -((dow + 6) % 7))
  return { ini: somarDias(segundaDestaSemana, -7), fim: somarDias(segundaDestaSemana, -1) }
}
