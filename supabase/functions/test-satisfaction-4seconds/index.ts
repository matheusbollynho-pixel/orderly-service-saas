// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const allowedOrigin = Deno.env.get('CORS_ALLOWED_ORIGIN') ?? '*'
const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

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
  const ZAPI_INSTANCE_ID = Deno.env.get('ZAPI_INSTANCE_ID')!
  const ZAPI_CLIENT_TOKEN = Deno.env.get('ZAPI_CLIENT_TOKEN')!
  const ZAPI_TOKEN = Deno.env.get('ZAPI_TOKEN')!

  const cleanPhone = phone.replace(/\D/g, '')
  const formattedPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`

  const url = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/send-text`
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Client-Token': ZAPI_CLIENT_TOKEN,
    },
    body: JSON.stringify({
      phone: formattedPhone,
      message: message,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Z-API error: ${error}`)
  }

  return await response.json()
}

Deno.serve(async (req) => {
  // Preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  try {
    console.log('🧪 TESTE COM 4 SEGUNDOS - Procurando ordem de Matheus...')
    
    // Buscar ordem de Matheus
    const { data: orders, error } = await supabase
      .from('service_orders')
      .select('id, client_name, client_phone')
      .ilike('client_name', '%Matheus%')
      .order('created_at', { ascending: false })
      .limit(1)
    
    if (error || !orders || orders.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Ordem de Matheus não encontrada',
        error: error?.message
      }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
        status: 404,
      })
    }

    const order = orders[0]
    console.log(`📋 Encontrada ordem de ${order.client_name} (${order.client_phone})`)

    if (!order.client_phone) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Ordem de Matheus não tem telefone cadastrado'
      }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
        status: 400,
      })
    }

    // Criar pagamento com timestamp de 4 segundos atrás
    const fourSecondsAgo = new Date(Date.now() - 4000).toISOString()
    console.log(`💰 Criando pagamento com timestamp: ${fourSecondsAgo}`)

    const { error: paymentError } = await supabase
      .from('payments')
      .insert({
        order_id: order.id,
        amount: 0.01,
        method: 'pix',
        created_at: fourSecondsAgo,
      })

    if (paymentError) {
      console.error('❌ Erro ao criar pagamento:', paymentError)
      return new Response(JSON.stringify({
        success: false,
        message: `Erro ao criar pagamento: ${paymentError.message}`
      }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
        status: 400,
      })
    }

    console.log('✅ Pagamento criado com sucesso')

    // Aguardar 1 segundo
    await new Promise(r => setTimeout(r, 1000))

    // Enviar mensagem de satisfação
    console.log(`📱 Enviando mensagem de satisfação para ${order.client_name}...`)
    await sendWhatsApp(order.client_phone, SATISFACTION_MESSAGE)
    
    // Atualizar timestamp
    await supabase
      .from('service_orders')
      .update({ satisfaction_survey_sent_at: new Date().toISOString() })
      .eq('id', order.id)
    
    console.log(`✅ Mensagem enviada com sucesso!`)

    return new Response(JSON.stringify({
      success: true,
      message: `✅ Teste realizado! Pesquisa enviada para ${order.client_name}`,
      order: {
        id: order.id,
        name: order.client_name,
        phone: order.client_phone
      }
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
      status: 200,
    })
  } catch (error) {
    console.error('❌ Erro:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
      status: 500,
    })
  }
})
