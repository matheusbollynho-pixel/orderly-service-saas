import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendWhatsAppText, normalizeBrPhone } from '../_shared/whatsapp.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

Deno.serve(async (req) => {
  const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const payload = await req.json()
    // Payload vem do trigger: { record: { ... } }
    const rating = payload.record || payload

    const atendimento = rating.atendimento_rating ?? null
    const servico = rating.servico_rating ?? null

    // Só dispara se alguma nota for < 3
    const isCrisis = (atendimento !== null && atendimento < 3) || (servico !== null && servico < 3)
    if (!isCrisis) return new Response(JSON.stringify({ skipped: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    // Loja legada (Bandara) — pode usar a instância global como fallback.
    const LEGACY_DEFAULT_STORE_ID = '9fd27114-97d1-48cd-ad09-1b057fa9c185'

    // Busca dados DA LOJA DA AVALIAÇÃO (nunca "a primeira loja").
    const storeId = rating.store_id as string | undefined
    if (!storeId) {
      return new Response(JSON.stringify({ skipped: true, reason: 'Avaliação sem store_id' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const { data: settings } = await supabase
      .from('store_settings')
      .select('company_name, boleto_notify_phone_1, boleto_notify_phone_2, whatsapp_provider, whatsapp_instance_url, whatsapp_instance_token')
      .eq('id', storeId)
      .maybeSingle()

    const company = settings?.company_name || 'Minha Oficina'
    const phones = [settings?.boleto_notify_phone_1, settings?.boleto_notify_phone_2].filter(Boolean) as string[]

    if (phones.length === 0) {
      return new Response(JSON.stringify({ skipped: true, reason: 'Nenhum número configurado' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Alerta sai pela instância DA LOJA. Sem instância própria (e não sendo a
    // legada) → não envia, pra não vazar pelo número global.
    const temInstanciaPropria = !!settings?.whatsapp_instance_url
    const isLegacy = storeId === LEGACY_DEFAULT_STORE_ID
    if (!temInstanciaPropria && !isLegacy) {
      return new Response(JSON.stringify({ skipped: true, reason: 'Loja sem WhatsApp próprio' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const wppConfig = temInstanciaPropria
      ? {
          provider: settings?.whatsapp_provider || undefined,
          instance_url: settings?.whatsapp_instance_url || undefined,
          instance_token: settings?.whatsapp_instance_token || undefined,
        }
      : undefined

    // Busca nome do cliente
    let clientName = 'Cliente'
    let clientPhone = ''
    if (rating.client_id) {
      const { data: client } = await supabase.from('clients').select('name, phone').eq('id', rating.client_id).maybeSingle()
      if (client) { clientName = client.name || 'Cliente'; clientPhone = client.phone || '' }
    } else if (rating.order_id) {
      const { data: order } = await supabase.from('service_orders').select('client_name, client_phone, client_id').eq('id', rating.order_id).maybeSingle()
      if (order) {
        clientName = order.client_name || 'Cliente'
        clientPhone = order.client_phone || ''
        // Se a OS tem client_id, busca telefone do cadastro (mais atualizado)
        if (order.client_id) {
          const { data: client } = await supabase.from('clients').select('name, phone').eq('id', order.client_id).maybeSingle()
          if (client) { clientName = client.name || clientName; clientPhone = client.phone || clientPhone }
        }
      }
    }

    // Monta mensagem
    const notas: string[] = []
    if (atendimento !== null && atendimento < 3) notas.push(`Atendimento: ${atendimento}/5`)
    if (servico !== null && servico < 3) notas.push(`Serviço: ${servico}/5`)

    const comment = rating.comment ? `\n💬 *Comentário:* "${rating.comment}"` : ''
    const msg = `🚨 *Alerta de Crise — ${company}*\n\nUm cliente deixou uma avaliação crítica:\n\n👤 *Cliente:* ${clientName}${clientPhone ? `\n📱 *Telefone:* ${clientPhone}` : ''}\n⭐ *${notas.join(' | ')}*${comment}\n\nEntre em contato para resolver a situação!`

    // Envia para todos os números configurados, pela instância da loja
    const results = await Promise.allSettled(
      phones.map(phone => sendWhatsAppText(normalizeBrPhone(phone), msg, wppConfig, {
        storeId,
        feature: 'alerta_crise',
        allowGlobalFallback: wppConfig === undefined,
      }))
    )

    const sent = results.filter(r => r.status === 'fulfilled').length
    return new Response(JSON.stringify({ ok: true, sent, total: phones.length }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (err) {
    console.error('crisis-alert error:', err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
