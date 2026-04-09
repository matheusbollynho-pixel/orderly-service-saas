import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendWhatsAppText, normalizeBrPhone, type StoreWhatsAppConfig } from '../_shared/whatsapp.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const _rawBaseUrl = Deno.env.get('APP_BASE_URL') || 'https://speedseekos-demo.vercel.app'
const APP_BASE_URL = (_rawBaseUrl.startsWith('http') ? _rawBaseUrl : `https://${_rawBaseUrl}`).replace(/\/$/, '')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

function buildFollowUpMessage(clientName: string | null, numero: number, avaliacaoUrl: string, atendenteName: string | null, company_name: string, template: string): string {
  const nome = clientName ? `, ${clientName.split(' ')[0]}` : ''
  const atendente = atendenteName ? `*${atendenteName}* - ${company_name}` : `*${company_name}*`
  return template
    .replace(/\{\{nome\}\}/g, nome)
    .replace(/\{\{empresa\}\}/g, company_name)
    .replace(/\{\{numero\}\}/g, String(numero))
    .replace(/\{\{link\}\}/g, avaliacaoUrl)
    .replace(/\{\{atendente\}\}/g, atendente)
}

async function processarLoja(store: { id: string; company_name: string; whatsapp_balcao_followup_template: string | null; whatsapp_provider: string | null; whatsapp_instance_url: string | null; whatsapp_instance_token: string | null }) {
  const wppConfig: StoreWhatsAppConfig = {
    provider: store.whatsapp_provider || undefined,
    instance_url: store.whatsapp_instance_url || undefined,
    instance_token: store.whatsapp_instance_token || undefined,
  }
  const company_name = store.company_name || 'Minha Oficina'
  const template = store.whatsapp_balcao_followup_template ||
    'Olá{{nome}}! 👋\n\nAqui é da *{{empresa}}*.\n\nPassando para saber se tudo ficou certinho com seu atendimento da nota *#{{numero}}*. Ficou alguma dúvida ou podemos ajudar em algo? 😊\n\nSe quiser, deixa sua avaliação — leva menos de 1 minuto e nos ajuda muito! ⭐\n\n{{link}}\n\nAtt, {{atendente}} 🏍️🔧'

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const avaliacaoUrl = `${APP_BASE_URL}/avaliar/loja`

  const { data: orders, error } = await supabase
    .from('balcao_orders')
    .select('id, numero, client_name, client_phone, atendente_id, staff_members(name)')
    .eq('store_id', store.id)
    .eq('status', 'finalizada')
    .lte('finalized_at', cutoff)
    .is('follow_up_sent_at', null)
    .not('client_phone', 'is', null)
    .neq('client_phone', '')

  if (error || !orders?.length) return { store_id: store.id, enviados: 0 }

  let enviados = 0
  for (const order of orders) {
    try {
      const phone = normalizeBrPhone(order.client_phone)
      const atendenteName = (order.staff_members as { name?: string } | null)?.name ?? null
      const message = buildFollowUpMessage(order.client_name, order.numero, avaliacaoUrl, atendenteName, company_name, template)

      await sendWhatsAppText(phone, message, wppConfig)
      await supabase.from('balcao_orders')
        .update({ follow_up_sent_at: new Date().toISOString() })
        .eq('id', order.id)

      enviados++
      console.log(`✅ [${company_name}] Follow-up enviado: nota #${order.numero}`)
    } catch (err) {
      console.error(`❌ [${company_name}] Erro nota #${order.numero}:`, err)
    }
  }

  return { store_id: store.id, company: company_name, enviados }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })

  try {
    const { data: stores, error } = await supabase
      .from('store_settings')
      .select('id, company_name, whatsapp_balcao_followup_template, whatsapp_provider, whatsapp_instance_url, whatsapp_instance_token')
      .eq('active', true)

    if (error) throw error

    const results = []
    for (const store of stores || []) {
      const result = await processarLoja(store)
      results.push(result)
    }

    const totalEnviados = results.reduce((s, r) => s + r.enviados, 0)
    console.log(`📊 Total: ${totalEnviados} follow-ups em ${results.length} loja(s)`)

    return new Response(
      JSON.stringify({ success: true, lojas: results.length, enviados: totalEnviados }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('❌ Erro geral:', err)
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
