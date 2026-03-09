import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendWhatsAppText, normalizeBrPhone } from '../_shared/whatsapp.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendWhatsAppText, normalizeBrPhone } from '../_shared/whatsapp.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const APP_BASE_URL = (Deno.env.get('APP_BASE_URL') || 'https://orderly-service.vercel.app').replace(/\/$/, '')

function buildSatisfactionMessage(clientName: string, link: string) {
  return `Olá, ${clientName || 'cliente'}! 👋

Aqui é da *Bandara Motos*.

Sua opinião é muito importante para melhorarmos sempre.
Pode avaliar seu atendimento em menos de 1 minuto? ⭐

${link}

Obrigado pela confiança! 🏍️🔧`
}

function generatePublicToken() {
  return crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
}

async function ensureSatisfactionRow(order: Record<string, unknown>) {
  const { data: existing } = await supabase
    .from('satisfaction_ratings')
    .select('id, public_token, responded_at')
    .eq('order_id', order.id)
    .limit(1)

  if (existing && existing.length > 0) {
    return existing[0]
  }

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

  if (error) {
    throw new Error(`Erro ao criar registro de satisfação: ${error.message}`)
  }

  return inserted
}

async function sendWhatsApp(phone: string, message: string) {
  console.log(`📱 Enviando para: ${phone}`)
  
  const formattedPhone = normalizeBrPhone(phone)
  
  console.log(`📞 Phone formatado: ${formattedPhone}`)

  const result = await sendWhatsAppText(formattedPhone, message)
  console.log(`✅ Sucesso: ${JSON.stringify(result)}`)
  return result
}

Deno.serve(async (req) => {
  try {
    console.log(`📥 Request: ${req.method}`)
    
    if (req.method === 'OPTIONS') {
      return new Response(null, { 
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        }
      })
    }

    let body = {}
    try {
      if (req.method === 'POST') {
        const text = await req.text()
        console.log(`📥 Body text: ${text}`)
        if (text) {
          body = JSON.parse(text)
        }
      }
    } catch (e) {
      console.log(`⚠️ Erro ao parsear body: ${e.message}`)
    }

    console.log(`🔍 Body: ${JSON.stringify(body)}`)

    if (body.order_id) {
      console.log(`📋 Buscando ordem: ${body.order_id}`)
      
      const { data: orders, error } = await supabase
        .from('service_orders')
        .select('id, client_id, atendimento_id, mechanic_id, client_name, client_phone')
        .eq('id', body.order_id)
        .limit(1)

      if (error || !orders || orders.length === 0) {
        console.log(`❌ Ordem não encontrada`)
        return new Response(JSON.stringify({ success: false, message: 'Ordem não encontrada' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        })
      }

      const order = orders[0]
      console.log(`✅ Ordem encontrada: ${order.client_name}`)

      const ratingRow = await ensureSatisfactionRow(order)
      const link = `${APP_BASE_URL}/avaliar/${ratingRow.public_token}`
      const message = buildSatisfactionMessage(order.client_name, link)
      
      await sendWhatsApp(order.client_phone, message)

      await supabase
        .from('service_orders')
        .update({ satisfaction_survey_sent_at: new Date().toISOString() })
        .eq('id', order.id)
      
      return new Response(JSON.stringify({ success: true, message: `Enviado para ${order.client_name}` }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      })
    }

    console.log(`📊 Verificando ordens de 1 dia atrás`)
    
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()

    const { data: payments } = await supabase
      .from('payments')
      .select('order_id')
      .gte('created_at', twoDaysAgo)
      .lte('created_at', oneDayAgo)

    if (!payments || payments.length === 0) {
      console.log(`📭 Nenhum pagamento encontrado`)
      return new Response(JSON.stringify({ success: true, message: 'Nenhuma ordem para enviar', count: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      })
    }

    const orderIds = [...new Set(payments.map(p => p.order_id))]
    console.log(`📋 Encontradas ${orderIds.length} ordens`)

    const { data: orders } = await supabase
      .from('service_orders')
      .select('id, client_id, atendimento_id, mechanic_id, client_name, client_phone, satisfaction_survey_sent_at')
      .in('id', orderIds)
      .not('client_phone', 'is', null)

    // Proteção: só envia se não foi enviado nas últimas 24h
    const now = Date.now();
    const ordersToSend = (orders || []).filter(order => {
      if (!order.satisfaction_survey_sent_at) return true;
      const lastSent = new Date(order.satisfaction_survey_sent_at).getTime();
      return (now - lastSent) > 24 * 60 * 60 * 1000;
    });

    console.log(`📝 Ordens para enviar: ${ordersToSend.length}`);

    const results = []
    for (const order of ordersToSend) {
      try {
        const ratingRow = await ensureSatisfactionRow(order)
        const link = `${APP_BASE_URL}/avaliar/${ratingRow.public_token}`
        const message = buildSatisfactionMessage(order.client_name, link)

        await sendWhatsApp(order.client_phone, message)

        await supabase
          .from('service_orders')
          .update({ satisfaction_survey_sent_at: new Date().toISOString() })
          .eq('id', order.id)

        results.push({
          name: order.client_name,
          success: true,
          order_id: order.id,
          public_token: ratingRow.public_token,
          link
        })
      } catch (error) {
        console.error(`❌ Erro: ${error.message}`)
        results.push({ name: order.client_name, success: false, error: error.message })
      }
    }

    return new Response(JSON.stringify({ success: true, message: `${results.filter(r => r.success).length}/${results.length} enviadas`, results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })

  } catch (error) {
    console.error(`❌ Erro geral: ${error.message}`)
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })
  }
})
