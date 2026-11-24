// Alerta de validade no WhatsApp do dono (1x por dia, chamado pelo cron).
// Uma mensagem só por loja, com o resumo dos lotes (com saldo) que chegaram hoje em um destes pontos:
//   - entrou no prazo de aviso da loja (dias_aviso_validade): dá tempo de fazer promoção
//   - faltam 7 dias
//   - vence hoje
//   - venceu ontem: tirar da venda
// Cada lote aparece no máximo nesses 4 dias (não repete todo dia).
// Só lojas com alerta ligado, número do dono cadastrado e WhatsApp conectado.
// Não manda duas vezes no mesmo dia (alerta_validade_enviado_em).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendWhatsAppText, normalizeBrPhone, type StoreWhatsAppConfig } from '../_shared/whatsapp.ts'

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

// Loja "dona" da instância global compartilhada (legado, pré multi-tenant).
const LEGACY_DEFAULT_STORE_ID = '9fd27114-97d1-48cd-ad09-1b057fa9c185'
const MAX_POR_GRUPO = 15

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)) }

// Data de hoje no fuso da loja (−03:00)
function hojeLoja(): string { return new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10) }
function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000)
}
const brl = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`
const qtd = (v: number) => String(Number(v.toFixed(3))).replace('.', ',')
const fmtData = (d: string) => { const [y, m, dd] = d.split('-'); return `${dd}/${m}/${y}` }

interface Loja {
  id: string
  company_name: string | null
  boleto_notify_phone_1: string | null
  whatsapp_provider: string | null
  whatsapp_instance_url: string | null
  whatsapp_instance_token: string | null
  dias_aviso_validade: number | null
  alerta_validade_whatsapp: boolean | null
  alerta_validade_enviado_em: string | null
}
interface Lote {
  lote: string | null
  validade: string
  quantidade: number
  local: string | null
  inventory_products: { name: string; unit: string | null; cost_price: number | null; active: boolean | null } | null
}

/** Monta a mensagem da loja (ou null se não tem nada hoje). Exportada só pra teste. */
export function montarMensagem(company: string, lotes: Lote[], hoje: string, diasAviso: number): string | null {
  const grupos: { titulo: string; dias: number; itens: Lote[] }[] = [
    { titulo: '🔴 *Venceu ontem — tirar da venda:*', dias: -1, itens: [] },
    { titulo: '⚠️ *Vence HOJE:*', dias: 0, itens: [] },
    { titulo: '📅 *Vence em 7 dias:*', dias: 7, itens: [] },
  ]
  if (diasAviso > 7) grupos.push({ titulo: `🏷️ *Vence em ${diasAviso} dias — dá tempo de fazer promoção:*`, dias: diasAviso, itens: [] })

  for (const l of lotes) {
    if (!l.inventory_products || l.inventory_products.active === false) continue
    if (!(Number(l.quantidade) > 0.0005)) continue
    const d = diasEntre(hoje, l.validade)
    const g = grupos.find((x) => x.dias === d)
    if (g) g.itens.push(l)
  }
  const comItens = grupos.filter((g) => g.itens.length > 0)
  if (comItens.length === 0) return null

  const linhas: string[] = [`🧴 *Validade de produtos — ${company}*`]
  for (const g of comItens) {
    linhas.push('', g.titulo)
    const ordenados = [...g.itens].sort((a, b) => (a.inventory_products!.name || '').localeCompare(b.inventory_products!.name || ''))
    for (const l of ordenados.slice(0, MAX_POR_GRUPO)) {
      const p = l.inventory_products!
      const q = Number(l.quantidade)
      const un = (p.unit || '').toUpperCase()
      const custo = Number(p.cost_price || 0) * q
      linhas.push(`• ${p.name} — ${qtd(q)} ${un}${l.lote ? ` (lote ${l.lote})` : ''}${l.local === 'almox' ? ' · almoxarifado' : ''}${custo > 0 ? ` · ${brl(custo)}` : ''}`)
    }
    if (ordenados.length > MAX_POR_GRUPO) linhas.push(`• e mais ${ordenados.length - MAX_POR_GRUPO}...`)
  }
  linhas.push('', `Ver tudo: Relatórios → Estoque → Validade (hoje ${fmtData(hoje)})`)
  return linhas.join('\n')
}

async function processarLoja(store: Loja, hoje: string): Promise<'enviado' | 'nada' | 'pulado'> {
  if (store.alerta_validade_whatsapp === false) return 'pulado'
  if (store.alerta_validade_enviado_em === hoje) return 'pulado'
  const phone = store.boleto_notify_phone_1
  if (!phone) return 'pulado'
  if (!store.whatsapp_instance_url && store.id !== LEGACY_DEFAULT_STORE_ID) return 'pulado'

  const { data: lotes, error } = await supabase
    .from('inventory_lotes')
    .select('lote, validade, quantidade, local, inventory_products(name, unit, cost_price, active)')
    .eq('store_id', store.id)
    .gt('quantidade', 0)
    .not('validade', 'is', null)
    .limit(1000)
  if (error) { console.error(`validade-alertas: erro lendo lotes de ${store.id}`, error); return 'pulado' }

  const msg = montarMensagem(store.company_name || 'Minha Oficina', (lotes ?? []) as unknown as Lote[], hoje, Number(store.dias_aviso_validade ?? 30))
  if (!msg) return 'nada'

  const wppConfig: StoreWhatsAppConfig = {
    provider: store.whatsapp_provider || undefined,
    instance_url: store.whatsapp_instance_url || undefined,
    instance_token: store.whatsapp_instance_token || undefined,
  }
  // Marca antes de enviar: se o cron rodar de novo, não duplica
  await supabase.from('store_settings').update({ alerta_validade_enviado_em: hoje }).eq('id', store.id)
  await sendWhatsAppText(normalizeBrPhone(phone), msg, wppConfig, { storeId: store.id, feature: 'validade_alerta' })
  return 'enviado'
}

Deno.serve(async (req) => {
  // Só o cron chama (segredo enviado por public.cron_http, lido do Vault)
  const segredo = Deno.env.get('CRON_SECRET')
  if (!segredo || req.headers.get('x-cron-secret') !== segredo) {
    return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 })
  }
  try {
    const hoje = hojeLoja()
    const { data: stores, error } = await supabase
      .from('store_settings')
      .select('id, company_name, boleto_notify_phone_1, whatsapp_provider, whatsapp_instance_url, whatsapp_instance_token, dias_aviso_validade, alerta_validade_whatsapp, alerta_validade_enviado_em')
      .eq('active', true)
    if (error) throw error

    const resultado = { enviado: 0, nada: 0, pulado: 0 }
    for (const store of (stores ?? []) as Loja[]) {
      const r = await processarLoja(store, hoje)
      resultado[r]++
      // Sem rajada: espaça entre lojas que receberam
      if (r === 'enviado') await sleep(3000 + Math.random() * 4000)
    }
    return new Response(JSON.stringify({ ok: true, hoje, ...resultado }), { headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('validade-alertas error:', err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
