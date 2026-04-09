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
  if (digits.length < 10) return false
  if (/^(\d)\1+$/.test(digits)) return false
  const ddd = parseInt(digits.slice(0, 2))
  return ddd >= 11 && ddd <= 99
}

async function processarLoja(
  store: { id: string; company_name: string; whatsapp_satisfaction_template: string | null; whatsapp_provider: string | null; whatsapp_instance_url: string | null; whatsapp_instance_token: string | null },
  force: boolean
): Promise<{ store_id: string; enviados: number; erros: number }> {
  const wppConfig: StoreWhatsAppConfig = {
    provider: store.whatsapp_provider || undefined,
    instance_url: store.whatsapp_instance_url || undefined,
    instance_token: store.whatsapp_instance_token || undefined,
  }
  const company = store.company_name || 'Minha Oficina'
  const template = store.whatsapp_satisfaction_template ||
    'Olá, {{nome}}! 👋\n\nAqui é da *{{empresa}}*.\n\nSua opinião é muito importante para melhorarmos sempre.\nPode avaliar seu atendimento em menos de 1 minuto? ⭐\n\n{{link}}\n\nObrigado pela confiança! 🏍️🔧'

  let query = supabase
    .from('service_orders')
    .select('id, client_id, client_name, client_phone, mechanic_id, atendimento_id')
    .eq('store_id', store.id)
    .eq('status', 'concluida_entregue')
    .not('client_phone', 'is', null)
    .order('created_at', { ascending: false })

  if (!force) query = query.is('satisfaction_survey_sent_at', null)

  const { data: orders, error } = await query
  if (error || !orders?.length) return { store_id: store.id, enviados: 0, erros: 0 }

  let elegíveis = orders
  if (force) {
    const { data: jaAvaliaram } = await supabase
      .from('satisfaction_ratings')
      .select('order_id')
      .eq('store_id', store.id)
      .not('responded_at', 'is', null)
    const jaIds = new Set((jaAvaliaram || []).map(r => r.order_id))
    elegíveis = elegíveis.filter(o => !jaIds.has(o.id))
  }

  const pendentes = elegíveis.filter(o => o.client_phone && phoneValido(o.client_phone))

  let enviados = 0
  let erros = 0

  for (const order of pendentes) {
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

      await sendWhatsAppText(phone, message, wppConfig)

      await supabase.from('service_orders')
        .update({ satisfaction_survey_sent_at: new Date().toISOString() })
        .eq('id', order.id)

      enviados++
      console.log(`✅ [${company}] Satisfação enviada para ${order.client_name}`)
      await sleep(500)
    } catch (err) {
      erros++
      console.error(`❌ [${company}] Erro para ${order.client_name}:`, err)
      await sleep(300)
    }
  }

  return { store_id: store.id, enviados, erros }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    let force = false
    try { const b = await req.json(); force = !!b?.force } catch { /* sem body */ }

    const { data: stores, error } = await supabase
      .from('store_settings')
      .select('id, company_name, whatsapp_satisfaction_template, whatsapp_provider, whatsapp_instance_url, whatsapp_instance_token')
      .eq('active', true)

    if (error) throw error

    const results = []
    for (const store of stores || []) {
      const result = await processarLoja(store, force)
      results.push(result)
    }

    const totalEnviados = results.reduce((s, r) => s + r.enviados, 0)
    const totalErros = results.reduce((s, r) => s + r.erros, 0)
    console.log(`📊 Total: ${totalEnviados} enviados, ${totalErros} erros em ${results.length} loja(s)`)

    return new Response(JSON.stringify({ ok: true, lojas: results.length, enviados: totalEnviados, erros: totalErros }), {
      headers: { ...CORS, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    console.error('send-satisfaction-bulk error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' }
    })
  }
})
