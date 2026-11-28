// Resumo financeiro no WhatsApp do dono. Chamado pelo cron:
//   { tipo: 'diario' }  → todo dia 20h (Brasília): o dia de hoje
//   { tipo: 'semanal' } → segunda 8h: a semana passada (segunda a domingo)
// Só lojas com o resumo ligado, número do dono cadastrado e WhatsApp conectado. Uma mensagem por loja,
// marcada antes de enviar (cron repetido não duplica). Sem movimento e sem alerta = não manda nada.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendWhatsAppText, normalizeBrPhone, type StoreWhatsAppConfig } from '../_shared/whatsapp.ts'
import { hojeLoja, montarResumoFinanceiro, periodoDoResumo, type DadosFinanceiro } from '../_shared/financeiro/mensagem.ts'

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
// Loja "dona" da instância global compartilhada (legado, pré multi-tenant)
const LEGACY_DEFAULT_STORE_ID = '9fd27114-97d1-48cd-ad09-1b057fa9c185'
const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json' } })
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface Loja {
  id: string
  company_name: string | null
  boleto_notify_phone_1: string | null
  whatsapp_provider: string | null
  whatsapp_instance_url: string | null
  whatsapp_instance_token: string | null
  financeiro_resumo_diario: boolean | null
  financeiro_resumo_semanal: boolean | null
  financeiro_diario_enviado_em: string | null
  financeiro_semanal_enviado_em: string | null
}

async function processarLoja(loja: Loja, tipo: 'diario' | 'semanal', hoje: string): Promise<'enviado' | 'nada' | 'pulado'> {
  const ligado = tipo === 'diario' ? loja.financeiro_resumo_diario : loja.financeiro_resumo_semanal
  const marca = tipo === 'diario' ? 'financeiro_diario_enviado_em' : 'financeiro_semanal_enviado_em'
  if (!ligado) return 'pulado'
  if (loja[marca] === hoje) return 'pulado'
  if (!loja.boleto_notify_phone_1) return 'pulado'
  if (!loja.whatsapp_instance_url && loja.id !== LEGACY_DEFAULT_STORE_ID) return 'pulado'

  const p = periodoDoResumo(tipo, hoje)
  const { data, error } = await supabase.rpc('financeiro_resumo', { p_store_id: loja.id, p_ini: p.ini, p_fim: p.fim })
  if (error || !data) { console.error(`financeiro-resumo: erro calculando ${loja.id}`, error); return 'pulado' }
  const msg = montarResumoFinanceiro(data as DadosFinanceiro, loja.company_name || 'Minha loja', tipo)

  // Marca antes de enviar: se o cron rodar de novo, não duplica (vale também para "sem movimento")
  await supabase.from('store_settings').update({ [marca]: hoje }).eq('id', loja.id)
  if (!msg) return 'nada'
  const wpp: StoreWhatsAppConfig = {
    provider: loja.whatsapp_provider || undefined,
    instance_url: loja.whatsapp_instance_url || undefined,
    instance_token: loja.whatsapp_instance_token || undefined,
  }
  await sendWhatsAppText(normalizeBrPhone(loja.boleto_notify_phone_1), msg, wpp, { storeId: loja.id, feature: `financeiro_${tipo}` })
  return 'enviado'
}

Deno.serve(async (req) => {
  // Só o cron chama (segredo enviado por public.cron_http, lido do Vault)
  const segredo = Deno.env.get('CRON_SECRET')
  if (!segredo || req.headers.get('x-cron-secret') !== segredo) return json({ error: 'forbidden' }, 403)
  try {
    const corpo = await req.json().catch(() => ({})) as { tipo?: string }
    const tipo = corpo.tipo === 'semanal' ? 'semanal' : corpo.tipo === 'diario' ? 'diario' : null
    if (!tipo) return json({ error: 'tipo deve ser diario ou semanal' }, 400)
    const hoje = hojeLoja()
    const { data: lojas, error } = await supabase
      .from('store_settings')
      .select('id, company_name, boleto_notify_phone_1, whatsapp_provider, whatsapp_instance_url, whatsapp_instance_token, financeiro_resumo_diario, financeiro_resumo_semanal, financeiro_diario_enviado_em, financeiro_semanal_enviado_em')
      .eq('active', true)
      .eq(tipo === 'diario' ? 'financeiro_resumo_diario' : 'financeiro_resumo_semanal', true)
    if (error) throw error

    const resultado = { enviado: 0, nada: 0, pulado: 0 }
    for (const loja of (lojas ?? []) as Loja[]) {
      const r = await processarLoja(loja, tipo, hoje)
      resultado[r]++
      // Sem rajada: espaça entre lojas que receberam
      if (r === 'enviado') await sleep(3000 + Math.random() * 4000)
    }
    return json({ ok: true, tipo, hoje, ...resultado })
  } catch (err) {
    console.error('financeiro-resumo error:', err)
    return json({ error: String(err) }, 500)
  }
})
