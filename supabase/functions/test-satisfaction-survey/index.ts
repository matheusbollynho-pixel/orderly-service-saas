// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ZAPI_INSTANCE_ID = Deno.env.get('ZAPI_INSTANCE_ID')!
const ZAPI_CLIENT_TOKEN = Deno.env.get('ZAPI_CLIENT_TOKEN')!
const ZAPI_TOKEN = Deno.env.get('ZAPI_TOKEN')!

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

async function getTestOrders() {
  // TESTE: Buscar pagamentos de HOJE ao invés de ontem
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(0, 0, 0, 0)

  console.log('🔍 Buscando pagamentos de hoje:', today.toISOString(), 'até', tomorrow.toISOString())

  const { data: payments, error: paymentsError } = await supabase
    .from('payments')
    .select('order_id, created_at')
    .gte('created_at', today.toISOString())
    .lt('created_at', tomorrow.toISOString())
    .order('created_at', { ascending: false })

  console.log('💰 Pagamentos encontrados:', payments?.length || 0)

  if (paymentsError) throw paymentsError
  if (!payments || payments.length === 0) return []

  const orderIds = [...new Set(payments.map(p => p.order_id))]
  console.log('📋 Order IDs únicos:', orderIds)

  const { data: orders, error } = await supabase
    .from('service_orders')
    .select('id, client_name, client_phone, satisfaction_survey_sent_at')
    .in('id', orderIds)
    .not('client_phone', 'is', null)

  console.log('👥 Ordens encontradas:', orders?.length || 0)

  if (error) throw error

  // IMPORTANTE: Agrupar por telefone para enviar apenas 1 mensagem por cliente
  const uniqueClients = new Map()
  for (const order of orders || []) {
    const phone = order.client_phone.replace(/\D/g, '')
    if (!uniqueClients.has(phone)) {
      uniqueClients.set(phone, order)
    }
  }

  console.log('📞 Clientes únicos (por telefone):', uniqueClients.size)

  return Array.from(uniqueClients.values())
}

Deno.serve(async (req) => {
  try {
    console.log('🧪 TESTE - Verificando ordens com pagamento de HOJE...')
    
    const orders = await getTestOrders()
    console.log(`📊 Encontradas ${orders.length} ordem(ns) com pagamento hoje`)

    if (orders.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'Nenhuma ordem com pagamento hoje',
        count: 0
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    const results = []
    
    for (const order of orders) {
      try {
        console.log(`📱 Enviando pesquisa TESTE para ${order.client_name} (${order.client_phone})`)
        
        await sendWhatsApp(order.client_phone, SATISFACTION_MESSAGE)
        
        results.push({
          name: order.client_name,
          phone: order.client_phone,
          success: true,
          note: 'NÃO atualizado satisfaction_survey_sent_at (teste)'
        })
        
        console.log(`✅ Pesquisa TESTE enviada para ${order.client_name}`)
      } catch (error) {
        console.error(`❌ Erro ao enviar para ${order.client_name}:`, error)
        results.push({
          name: order.client_name,
          phone: order.client_phone,
          success: false,
          error: error.message
        })
      }
    }

    const successCount = results.filter(r => r.success).length
    
    return new Response(JSON.stringify({
      success: true,
      message: `TESTE: ${successCount}/${orders.length} pesquisas enviadas`,
      results: results
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('❌ Erro geral:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
