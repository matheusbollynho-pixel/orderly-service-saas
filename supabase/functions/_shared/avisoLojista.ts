// Aviso de "preço especial vencendo" (Lojista etc.) — texto da mensagem.
// Sem nada de Deno: usado pela função lojista-aviso-vencimento e pela prévia na tela (Clientes > Preço especial).

export const AVISO_LOJISTA_PADRAO =
  'Oi, {{nome}}! 👋\nSeu preço de *{{grupo}}* aqui na *{{empresa}}* vence {{quando}} ({{data}}).\n{{renova}}\nQualquer dúvida é só chamar. 😉'

/** Variáveis aceitas (tela Mensagens) */
export const VARIAVEIS_AVISO_LOJISTA = ['{{nome}}', '{{grupo}}', '{{empresa}}', '{{quando}}', '{{data}}', '{{minimo}}', '{{validade}}', '{{renova}}']

export interface DadosAviso {
  nome: string
  grupo: string
  loja: string
  validoAte: string // AAAA-MM-DD
  hoje: string // AAAA-MM-DD
  compraMinima: number
  validadeDias: number
}

const brl = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`
const fmtData = (d: string) => { const [y, m, dd] = d.split('-'); return `${dd}/${m}/${y}` }
export const diasAte = (de: string, ate: string) =>
  Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000)

/** Primeiro nome com só a inicial maiúscula ("MATHEUS DA SILVA" → "Matheus") */
export function primeiroNome(nome: string): string {
  const p = (nome || '').trim().split(/\s+/)[0] || ''
  return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : ''
}

export function montarAvisoLojista(texto: string | null | undefined, d: DadosAviso): string {
  const dias = diasAte(d.hoje, d.validoAte)
  const quando = dias <= 0 ? 'hoje' : dias === 1 ? 'amanhã' : `em ${dias} dias`
  const renova = d.compraMinima > 0
    ? `Uma compra a partir de *${brl(d.compraMinima)}* renova por mais ${d.validadeDias} dias.`
    : `Qualquer compra renova por mais ${d.validadeDias} dias.`
  const valores: Record<string, string> = {
    nome: d.nome, grupo: d.grupo, empresa: d.loja, loja: d.loja, quando, dias: String(Math.max(0, dias)),
    data: fmtData(d.validoAte), minimo: brl(d.compraMinima), validade: String(d.validadeDias), renova,
  }
  // {{nome}} (padrão das mensagens) ou {nome}
  return (texto && texto.trim() ? texto : AVISO_LOJISTA_PADRAO)
    .replace(/\{\{?(nome|grupo|empresa|loja|quando|dias|data|minimo|validade|renova)\}?\}/g, (_, k: string) => valores[k])
    .trim()
}

export interface CandidatoAviso {
  tipo_valido_ate: string | null
  tipo_aviso_para: string | null
  tipo_aviso_tentativas: number | null
  active: boolean | null
  autoriza_lembretes: boolean | null
  phone: string | null
  whatsapp: string | null
  tipos_cliente: { ativo: boolean; validade_dias: number | null; aviso_dias: number | null } | null
}

/** Este cliente deve receber o aviso hoje? (dentro da janela, ainda não avisado para esta validade) */
export function deveAvisar(c: CandidatoAviso, hoje: string): boolean {
  const t = c.tipos_cliente
  if (!t || !t.ativo || !t.validade_dias || !t.aviso_dias) return false
  if (!c.tipo_valido_ate || c.active === false || c.autoriza_lembretes === false) return false
  if (!(c.whatsapp || c.phone)) return false
  if ((c.tipo_aviso_tentativas ?? 0) >= 3) return false
  if (c.tipo_aviso_para === c.tipo_valido_ate) return false
  const d = diasAte(hoje, c.tipo_valido_ate)
  return d >= 0 && d <= t.aviso_dias
}
