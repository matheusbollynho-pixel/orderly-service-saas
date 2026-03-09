import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendWhatsAppText, normalizeBrPhone } from '../_shared/whatsapp.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const SATISFACTION_MESSAGE = `Olá! Tudo bem? 😊

Aqui é da *Bandara Motos*.

Queremos saber:
👉 Como foi seu atendimento com a gente?
👉 Ficou alguma dúvida sobre o serviço ou a peça?

*De 0 a 10*, o quanto você indicaria a Bandara Motos para um amigo? ⭐

Se precisar de algo, é só responder essa mensagem.
Estamos à disposição! 🏍️🔧

Siga-nos no Instagram: @BandaraMotos`

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
    
    // CORS
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

    // Parse body
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

    // Se tiver order_id, buscar ordem específica
    if (body.order_id) {
      console.log(`📋 Buscando ordem: ${body.order_id}`)
      
      const { data: orders, error } = await supabase
        .from('service_orders')
        .select('id, client_name, client_phone')
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
      
      await sendWhatsApp(order.client_phone, SATISFACTION_MESSAGE)
      
      return new Response(JSON.stringify({ success: true, message: `Enviado para ${order.client_name}` }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      })
    }

    // Caso contrário, buscar ordens de 1 dia atrás
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
      .select('id, client_name, client_phone, satisfaction_survey_sent_at')
      .in('id', orderIds)
      .is('satisfaction_survey_sent_at', null)
      .not('client_phone', 'is', null)

    console.log(`📝 Ordens sem pesquisa: ${orders?.length || 0}`)

    const results = []
    for (const order of orders || []) {
      try {
        await sendWhatsApp(order.client_phone, SATISFACTION_MESSAGE)
        
        await supabase
          .from('service_orders')
          .update({ satisfaction_survey_sent_at: new Date().toISOString() })
          .eq('id', order.id)
        
        results.push({ name: order.client_name, success: true })
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
