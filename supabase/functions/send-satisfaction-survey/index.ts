import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendWhatsAppText, normalizeBrPhone } from '../_shared/whatsapp.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const _rawBaseUrl = Deno.env.get('APP_BASE_URL') || 'https://os-bandara.vercel.app'
const APP_BASE_URL = (_rawBaseUrl.startsWith('http') ? _rawBaseUrl : `https://${_rawBaseUrl}`).replace(/\/$/, '')

async function loadSettings() {
  const { data } = await supabase.from('store_settings').select('company_name, whatsapp_satisfaction_template').limit(1).maybeSingle()
  return {
    company_name: data?.company_name || 'Minha Oficina',
    template: data?.whatsapp_satisfaction_template || 'Olá, {{nome}}! 👋\n\nAqui é da *{{empresa}}*.\n\nSua opinião é muito importante para melhorarmos sempre.\nPode avaliar seu atendimento em menos de 1 minuto? ⭐\n\n{{link}}\n\nObrigado pela confiança! 🏍️🔧',
  }
}

function buildSatisfactionMessage(clientName: string, link: string, company_name: string, template: string) {
  return template
    .replace(/\{\{nome\}\}/g, clientName || 'cliente')
    .replace(/\{\{empresa\}\}/g, company_name)
    .replace(/\{\{link\}\}/g, link)
}

function generatePublicToken() {
  return crypto.randomUUID().replace(/-/g, '')
}

async function ensureSatisfactionRow(order: any) {
  const { data: existing } = await supabase
    .from('satisfaction_ratings')
    .select('id, public_token, responded_at')
    .eq('order_id', order.id)
    .maybeSingle()

  if (existing) return existing

  const token = generatePublicToken()
  const { data: inserted, error } = await supabase
    .from('satisfaction_ratings')
    .insert({
      order_id: order.id,
      client_id: order.client_id,
      atendimento_id: order.atendimento_id || null,
      mechanic_id: order.mechanic_id || null,
      public_token: token,
      status: 'pendente',
    })
    .select('id, public_token, responded_at')
    .single()

  if (error) throw new Error(`Erro ao criar registro: ${error.message}`)
  return inserted
}

Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })

  try {
    let body: any = {}
    if (req.method === 'POST') {
      const text = await req.text()
      if (text) body = JSON.parse(text)
    }

    if (body && body.order_id) {
      const { data: order } = await supabase
        .from('service_orders')
        .select('id, client_id, atendimento_id, mechanic_id, client_name, client_phone')
        .eq('id', body.order_id)
        .single()

      if (order) {
        const ratingRow = await ensureSatisfactionRow(order)
        const link = `${APP_BASE_URL}/avaliar/${ratingRow.public_token}`
        const { company_name, template } = await loadSettings()
        const message = buildSatisfactionMessage(order.client_name, link, company_name, template)
        await sendWhatsAppText(normalizeBrPhone(order.client_phone), message)
        await supabase.from('service_orders').update({ satisfaction_survey_sent_at: new Date().toISOString() }).eq('id', order.id)
      }
    }

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})