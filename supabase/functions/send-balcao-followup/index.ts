import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendWhatsAppText, normalizeBrPhone } from '../_shared/whatsapp.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const _rawBaseUrl = Deno.env.get('APP_BASE_URL') || 'https://os-bandara.vercel.app'
const APP_BASE_URL = (_rawBaseUrl.startsWith('http') ? _rawBaseUrl : `https://${_rawBaseUrl}`).replace(/\/$/, '')

async function loadSettings() {
  const { data } = await supabase.from('store_settings').select('company_name, whatsapp_balcao_followup_template').limit(1).maybeSingle()
  return {
    company_name: data?.company_name || 'Minha Oficina',
    template: data?.whatsapp_balcao_followup_template || 'Olá{{nome}}! 👋\n\nAqui é da *{{empresa}}*.\n\nPassando para saber se tudo ficou certinho com seu atendimento da nota *#{{numero}}*. Ficou alguma dúvida ou podemos ajudar em algo? 😊\n\nSe quiser, deixa sua avaliação — leva menos de 1 minuto e nos ajuda muito! ⭐\n\n{{link}}\n\nAtt, {{atendente}} 🏍️🔧',
  }
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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })

  try {
    // Busca notas de balcão finalizadas há 24h+ sem follow-up enviado
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const { data: orders, error } = await supabase
      .from('balcao_orders')
      .select('id, numero, client_name, client_phone, atendente_id, staff_members(name)')
      .eq('status', 'finalizada')
      .lte('finalized_at', cutoff)
      .is('follow_up_sent_at', null)
      .not('client_phone', 'is', null)
      .neq('client_phone', '')

    if (error) throw new Error(`Erro ao buscar notas: ${error.message}`)

    console.log(`📋 ${orders?.length ?? 0} nota(s) para follow-up`)

    const results: { id: string; numero: number; status: string }[] = []
    const avaliacaoUrl = `${APP_BASE_URL}/avaliar/loja`
    const { company_name, template } = await loadSettings()

    for (const order of orders ?? []) {
      try {
        const phone = normalizeBrPhone(order.client_phone)
        const atendenteName = (order.staff_members as any)?.name ?? null
        const message = buildFollowUpMessage(order.client_name, order.numero, avaliacaoUrl, atendenteName, company_name, template)

        await sendWhatsAppText(phone, message)

        await supabase
          .from('balcao_orders')
          .update({ follow_up_sent_at: new Date().toISOString() })
          .eq('id', order.id)

        console.log(`✅ Follow-up enviado: nota #${order.numero} → ${phone}`)
        results.push({ id: order.id, numero: order.numero, status: 'enviado' })
      } catch (err) {
        console.error(`❌ Erro nota #${order.numero}:`, err.message)
        results.push({ id: order.id, numero: order.numero, status: `erro: ${err.message}` })
      }
    }

    return new Response(
      JSON.stringify({ success: true, processed: results.length, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('❌ Erro geral:', err.message)
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
