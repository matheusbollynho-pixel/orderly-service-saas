/**
 * send-satisfaction-bulk
 * Envia pesquisa de satisfação por loja ativa.
 * Chamado manualmente pelo dashboard ou via cron.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendWhatsAppText, normalizeBrPhone, type StoreWhatsAppConfig } from '../_shared/whatsapp.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const APP_BASE_URL = (Deno.env.get('APP_BASE_URL') || 'https://speedseekos-demo.vercel.app').replace(/\/$/, '')

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }
function generateToken() { return crypto.randomUUID().replace(/-/g, '') }
function buildMessage(clientName: string, link: string, company: string, template: string) {
  return template
    .replace(/\{\{nome\}\}/g, clientName || 'cliente')
    .replace(/\{\{empresa\}\}/g, company)
    .replace(/\{\{link\}\}/g, link)
}

function phoneValido(phone: string): boolean {
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 10 || digits.length > 13) return false
  if (/^(\d)\1+$/.test(digits)) return false
  const semDDI = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits
  const ddd = parseInt(semDDI.slice(0, 2))
  return ddd >= 11 && ddd <= 99
}

// Loja "dona" da instância global compartilhada (legado, pré multi-tenant).
const LEGACY_DEFAULT_STORE_ID = '9fd27114-97d1-48cd-ad09-1b057fa9c185'

// Envio em conta-gotas (o WhatsApp da Bandara já foi bloqueado por rajada):
// cada chamada manda NO MÁXIMO 1 pesquisa por loja, depois de uma espera
// sorteada, só em horário comercial, com teto diário por loja. O cron roda
// a cada poucos minutos e às vezes "pula" a vez, então o intervalo entre
// mensagens nunca fica redondo/regular.
const PROB_PULAR = 0.35
const ESPERA_MIN_S = 5
const ESPERA_MAX_S = 150
const MAX_POR_DIA_POR_LOJA = 40
const HORA_INICIO = 8   // BRT
const HORA_FIM = 18     // BRT, exclusivo
// OS anteriores a isso nunca recebem (cron quebrou em 25/08/2026; o que é
// mais antigo é histórico de antes da funcionalidade existir).
const ENVIAR_DESDE = '2026-08-20T00:00:00-03:00'

function aleatorio(min: number, max: number) { return min + Math.random() * (max - min) }

function dentroDoHorario(): boolean {
  const brt = new Date(Date.now() - 3 * 3600000)
  const dia = brt.getUTCDay() // 0 = domingo
  const hora = brt.getUTCHours()
  return dia !== 0 && hora >= HORA_INICIO && hora < HORA_FIM
}

type Loja = { id: string; company_name: string; whatsapp_satisfaction_template: string | null; whatsapp_provider: string | null; whatsapp_instance_url: string | null; whatsapp_instance_token: string | null; whatsapp_bulk_paused?: boolean }

async function enviarUmaDaLoja(store: Loja): Promise<'enviado' | 'erro' | 'nada'> {
  if (store.whatsapp_bulk_paused) return 'nada'
  if (!store.whatsapp_instance_url && store.id !== LEGACY_DEFAULT_STORE_ID) return 'nada'

  const inicioDoDiaBRT = new Date(Date.now() - 3 * 3600000)
  inicioDoDiaBRT.setUTCHours(3, 0, 0, 0) // 00:00 BRT
  const { count } = await supabase
    .from('service_orders')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', store.id)
    .gte('satisfaction_survey_sent_at', inicioDoDiaBRT.toISOString())
  if ((count ?? 0) >= MAX_POR_DIA_POR_LOJA) return 'nada'

  const { data: orders, error } = await supabase
    .from('service_orders')
    .select('id, client_id, client_name, client_phone, mechanic_id, atendimento_id')
    .eq('store_id', store.id)
    .eq('status', 'concluida_entregue')
    .is('satisfaction_survey_sent_at', null)
    .not('client_phone', 'is', null)
    .gte('created_at', ENVIAR_DESDE)
    .order('created_at', { ascending: false })
    .limit(30)
  if (error || !orders?.length) return 'nada'

  const order = orders.find(o => o.client_phone && phoneValido(o.client_phone))
  if (!order) return 'nada'

  const wppConfig: StoreWhatsAppConfig = {
    provider: store.whatsapp_provider || undefined,
    instance_url: store.whatsapp_instance_url || undefined,
    instance_token: store.whatsapp_instance_token || undefined,
  }
  const company = store.company_name || 'Minha Oficina'
  const template = store.whatsapp_satisfaction_template ||
    'Olá, {{nome}}! 👋\n\nAqui é da *{{empresa}}*.\n\nSua opinião é muito importante para melhorarmos sempre.\nPode avaliar seu atendimento em menos de 1 minuto? ⭐\n\n{{link}}\n\nObrigado pela confiança! 🏍️🔧'

  // Marca antes de enviar: se der erro, não fica tentando o mesmo número
  // a cada execução.
  await supabase.from('service_orders')
    .update({ satisfaction_survey_sent_at: new Date().toISOString() })
    .eq('id', order.id)

  try {
    const { data: existing } = await supabase
      .from('satisfaction_ratings')
      .select('id, public_token')
      .eq('order_id', order.id)
      .maybeSingle()

    let token: string
    if (existing) {
      token = existing.public_token
    } else {
      token = generateToken()
      await supabase.from('satisfaction_ratings').insert({
        store_id: store.id,
        order_id: order.id,
        client_id: order.client_id,
        atendimento_id: order.atendimento_id || null,
        mechanic_id: order.mechanic_id || null,
        public_token: token,
        status: 'pendente',
      })
    }

    const link = `${APP_BASE_URL}/avaliar/${token}`
    const message = buildMessage(order.client_name, link, company, template)
    const phone = normalizeBrPhone(order.client_phone.replace(/\D/g, ''))

    await sendWhatsAppText(phone, message, wppConfig, { storeId: store.id, feature: 'satisfacao' })
    console.log(`✅ [${company}] Satisfação enviada para ${order.client_name}`)
    return 'enviado'
  } catch (err) {
    console.error(`❌ [${company}] Erro para ${order.client_name}:`, err)
    return 'erro'
  }
}

async function rodada() {
  if (Math.random() < PROB_PULAR) { console.log('⏭️ Pulando esta rodada (intervalo irregular)'); return }
  await sleep(aleatorio(ESPERA_MIN_S, ESPERA_MAX_S) * 1000)

  const { data: stores, error } = await supabase
    .from('store_settings')
    .select('id, company_name, whatsapp_satisfaction_template, whatsapp_provider, whatsapp_instance_url, whatsapp_instance_token, whatsapp_bulk_paused')
    .eq('active', true)
  if (error) { console.error('send-satisfaction-bulk lojas:', error); return }

  for (const store of stores || []) {
    const r = await enviarUmaDaLoja(store)
    if (r !== 'nada') await sleep(aleatorio(2, 8) * 1000)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  // Só o cron chama (segredo próprio; a chave JWT antiga do projeto foi
  // desativada e o gateway recusava a chamada).
  const segredo = Deno.env.get('CRON_SECRET')
  if (!segredo || req.headers.get('x-cron-secret') !== segredo) {
    return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }

  if (!dentroDoHorario()) {
    return new Response(JSON.stringify({ ok: true, fora_do_horario: true }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
  }

  // Responde na hora (pg_net tem timeout curto) e envia em segundo plano.
  // @ts-ignore EdgeRuntime existe no runtime do Supabase
  EdgeRuntime.waitUntil(rodada().catch(e => console.error('send-satisfaction-bulk error:', e)))
  return new Response(JSON.stringify({ ok: true }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
})
