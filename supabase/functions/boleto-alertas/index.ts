import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendWhatsAppText, normalizeBrPhone } from '../_shared/whatsapp.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // Busca configurações da loja
    const { data: settings } = await supabase
      .from('store_settings')
      .select('company_name, boleto_notify_phone_1, boleto_notify_phone_2')
      .limit(1)
      .maybeSingle()

    const company = settings?.company_name || 'Minha Oficina'
    const phones = [settings?.boleto_notify_phone_1, settings?.boleto_notify_phone_2]
      .filter(Boolean) as string[]

    if (phones.length === 0) {
      return new Response(JSON.stringify({ skipped: true, reason: 'Nenhum número configurado' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Busca boletos não pagos com notify_whatsapp ativo
    const { data: boletos, error } = await supabase
      .from('boletos')
      .select('*')
      .is('paid_at', null)
      .eq('notify_whatsapp', true)

    if (error) throw error
    if (!boletos || boletos.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Calcula hoje sem hora
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)

    let sent = 0

    for (const boleto of boletos) {
      const [y, m, d] = boleto.vencimento.split('-').map(Number)
      const venc = new Date(y, m - 1, d)
      const diffDias = Math.round((venc.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24))

      // Verifica se hoje é um dos dias de alerta configurados
      const alertDays: number[] = boleto.alert_days ?? []
      if (!alertDays.includes(diffDias)) continue

      // Monta mensagem
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

      // Envia para todos os números configurados
      await Promise.allSettled(
        phones.map(phone => sendWhatsAppText(normalizeBrPhone(phone), msg))
      )
      sent++
    }

    return new Response(JSON.stringify({ ok: true, sent }), {
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
