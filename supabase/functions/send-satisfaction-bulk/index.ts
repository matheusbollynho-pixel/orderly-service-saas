/**
 * send-satisfaction-bulk
 * Envia pesquisa de satisfação para todos os clientes com OS entregue
 * que ainda NÃO avaliaram a loja.
 * Respeita um delay entre envios para não sobrecarregar o WhatsApp.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendWhatsAppText, normalizeBrPhone } from '../_shared/whatsapp.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const APP_BASE_URL = (Deno.env.get('APP_BASE_URL') || 'https://os-bandara.vercel.app').replace(/\/$/, '')

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

function generateToken() {
  return crypto.randomUUID().replace(/-/g, '')
}

function buildMessage(clientName: string, link: string, company: string, template: string) {
  return template
    .replace(/\{\{nome\}\}/g, clientName || 'cliente')
    .replace(/\{\{empresa\}\}/g, company)
    .replace(/\{\{link\}\}/g, link)
}

async function executarDisparo(force = false): Promise<{ enviados: number; erros: number; pendentes: number }> {
    // Configurações da loja
    const { data: settings } = await supabase
      .from('store_settings')
      .select('company_name, whatsapp_satisfaction_template')
      .limit(1)
      .maybeSingle()

    const company = settings?.company_name || 'Bandara Motos'
    const template = settings?.whatsapp_satisfaction_template ||
      'Olá, {{nome}}! 👋\n\nAqui é da *{{empresa}}*.\n\nSua opinião é muito importante para melhorarmos sempre.\nPode avaliar seu atendimento em menos de 1 minuto? ⭐\n\n{{link}}\n\nObrigado pela confiança! 🏍️🔧'

    // force=true: envia para todos que não avaliaram ainda (ignora se já recebeu link)
    // force=false: envia só para quem nunca recebeu o link
    let query = supabase
      .from('service_orders')
      .select('id, client_id, client_name, client_phone, mechanic_id, atendimento_id')
      .eq('status', 'concluida_entregue')
      .not('client_phone', 'is', null)
      .order('created_at', { ascending: false })

    if (!force) {
      query = query.is('satisfaction_survey_sent_at', null)
    }

    const { data: orders, error: ordersErr } = await query

    if (ordersErr) throw ordersErr
    if (!orders?.length) {
      return { enviados: 0, erros: 0, pendentes: 0 }
    }

    // Se force, exclui quem já respondeu
    let elegíveis = orders || []
    if (force) {
      const { data: jaAvaliaram } = await supabase
        .from('satisfaction_ratings')
        .select('order_id')
        .not('responded_at', 'is', null)
      const jaIds = new Set((jaAvaliaram || []).map(r => r.order_id))
      elegíveis = elegíveis.filter(o => !jaIds.has(o.id))
    }

    const pendentes = elegíveis.filter(o => {
      if (!o.client_phone) return false
      const digits = o.client_phone.replace(/\D/g, '')
      if (digits.length < 10) return false
      // Bloqueia números falsos: todos dígitos iguais (00000, 11111, etc.)
      if (/^(\d)\1+$/.test(digits)) return false
      // Deve começar com DDD válido (11-99)
      const ddd = parseInt(digits.slice(0, 2))
      if (ddd < 11 || ddd > 99) return false
      return true
    })

    console.log(`📊 OS sem link enviado: ${orders.length} | Com telefone válido: ${pendentes.length}`)

    let enviados = 0
    let erros = 0
    const detalhes: { name: string; status: string }[] = []

    for (const order of pendentes) {
      try {
        // Garante registro na satisfaction_ratings
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

        await sendWhatsAppText(phone, message)

        // Marca que survey foi enviada
        await supabase
          .from('service_orders')
          .update({ satisfaction_survey_sent_at: new Date().toISOString() })
          .eq('id', order.id)

        enviados++
        detalhes.push({ name: order.client_name, status: 'enviado' })
        console.log(`✅ Enviado para ${order.client_name} (${phone})`)

        // Delay entre envios para não ser bloqueado
        await sleep(500)
      } catch (err) {
        erros++
        detalhes.push({ name: order.client_name, status: `erro: ${String(err)}` })
        console.error(`❌ Erro para ${order.client_name}:`, err)
        await sleep(300)
      }
    }

    return { enviados, erros, pendentes: pendentes.length }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    let force = false
    try { const b = await req.json(); force = !!b?.force } catch { /* sem body */ }
    const result = await executarDisparo(force)
    return new Response(JSON.stringify({ ok: true, ...result }), {
      headers: { ...CORS, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    console.error('send-satisfaction-bulk error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' }
    })
  }
})
