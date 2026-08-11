import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendWhatsAppText, normalizeBrPhone, type StoreWhatsAppConfig } from '../_shared/whatsapp.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

// Loja "dona" da instância global compartilhada (legado, pré multi-tenant).
const LEGACY_DEFAULT_STORE_ID = '9fd27114-97d1-48cd-ad09-1b057fa9c185'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function processarLoja(store: {
  id: string
  company_name: string | null
  boleto_notify_phone_1: string | null
  boleto_notify_phone_2: string | null
  whatsapp_provider: string | null
  whatsapp_instance_url: string | null
  whatsapp_instance_token: string | null
}): Promise<number> {
  const company = store.company_name || 'Minha Oficina'
  const phones = [store.boleto_notify_phone_1, store.boleto_notify_phone_2].filter(Boolean) as string[]
  if (phones.length === 0) return 0

  const semInstanciaPropria = !store.whatsapp_instance_url && store.id !== LEGACY_DEFAULT_STORE_ID
  if (semInstanciaPropria) {
    console.log(`⏭️ Loja ${company} sem WhatsApp configurado — pulando alerta de boletos`)
    return 0
  }

  const wppConfig: StoreWhatsAppConfig = {
    provider: store.whatsapp_provider || undefined,
    instance_url: store.whatsapp_instance_url || undefined,
    instance_token: store.whatsapp_instance_token || undefined,
  }

  // Busca boletos não pagos com notify_whatsapp ativo, só dessa loja
  const { data: boletos, error } = await supabase
    .from('boletos')
    .select('*')
    .eq('store_id', store.id)
    .is('paid_at', null)
    .eq('notify_whatsapp', true)

  if (error || !boletos || boletos.length === 0) return 0

  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)

  let sent = 0

  for (const boleto of boletos) {
    const [y, m, d] = boleto.vencimento.split('-').map(Number)
    const venc = new Date(y, m - 1, d)
    const diffDias = Math.round((venc.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24))

    const alertDays: number[] = boleto.alert_days ?? []
    if (!alertDays.includes(diffDias)) continue

    const valorFmt = `R$ ${Number(boleto.valor).toFixed(2).replace('.', ',')}`
    const vencFmt = `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`

    let prazo = ''
    if (diffDias === 0) prazo = '⚠️ *Vence HOJE*'
    else if (diffDias < 0) prazo = `🔴 *Vencido há ${Math.abs(diffDias)} dia(s)*`
    else prazo = `📅 Vence em *${diffDias} dia(s)* (${vencFmt})`

    const msg =
      `💸 *Alerta de Boleto — ${company}*\n\n` +
      `${prazo}\n\n` +
      `🏢 *Credor:* ${boleto.credor}\n` +
      `💰 *Valor:* ${valorFmt}\n` +
      `📋 *Categoria:* ${boleto.categoria}`

    await Promise.allSettled(
      phones.map(phone => sendWhatsAppText(normalizeBrPhone(phone), msg, wppConfig))
    )
    sent++
  }

  return sent
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { data: stores, error } = await supabase
      .from('store_settings')
      .select('id, company_name, boleto_notify_phone_1, boleto_notify_phone_2, whatsapp_provider, whatsapp_instance_url, whatsapp_instance_token')
      .eq('active', true)

    if (error) throw error

    let sent = 0
    for (const store of stores || []) {
      sent += await processarLoja(store)
    }

    return new Response(JSON.stringify({ ok: true, sent, lojas: stores?.length || 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('boleto-alertas error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
