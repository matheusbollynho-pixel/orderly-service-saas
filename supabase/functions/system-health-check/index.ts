/**
 * system-health-check
 * Cron diário. Verifica cron jobs falhando e envios de WhatsApp com erro
 * nas últimas 24h, agrupados por loja, e manda um resumo pro dono (DONO_PHONE).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendWhatsAppText, normalizeBrPhone } from '../_shared/whatsapp.ts'

const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const DONO_PHONE = Deno.env.get('DONO_PHONE') || ''

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const { data: failedCrons } = await sb.rpc('get_failed_cron_runs', { since })

    const { data: failedSends } = await sb
      .from('whatsapp_send_log')
      .select('store_id, feature, created_at, store_settings(company_name)')
      .eq('success', false)
      .gte('created_at', since)
      .order('created_at', { ascending: false })

    const cronsFalhando = new Map<string, number>()
    for (const c of failedCrons || []) {
      cronsFalhando.set(c.jobname, (cronsFalhando.get(c.jobname) || 0) + 1)
    }

    const porLoja = new Map<string, { nome: string; recursos: Map<string, number> }>()
    for (const s of failedSends || []) {
      const storeId = s.store_id as string
      const nome = (s.store_settings as { company_name?: string } | null)?.company_name || 'Loja desconhecida'
      if (!porLoja.has(storeId)) porLoja.set(storeId, { nome, recursos: new Map() })
      const entry = porLoja.get(storeId)!
      entry.recursos.set(s.feature, (entry.recursos.get(s.feature) || 0) + 1)
    }

    if (cronsFalhando.size === 0 && porLoja.size === 0) {
      if (DONO_PHONE) {
        await sendWhatsAppText(normalizeBrPhone(DONO_PHONE), '✅ SpeedSeek OS — relatório diário\n\nTudo funcionando normal nas últimas 24h. Nenhum cron falhou, nenhum envio de WhatsApp deu erro.')
      }
      return new Response(JSON.stringify({ ok: true, problemas: false }), { status: 200, headers: CORS })
    }

    let msg = '⚠️ *SpeedSeek OS — relatório diário*\n\n'

    if (cronsFalhando.size > 0) {
      msg += '*🔧 Tarefas automáticas quebradas:*\n'
      for (const [job, count] of cronsFalhando) {
        msg += `• ${job} — falhou ${count}x\n`
      }
      msg += '\n'
    }

    if (porLoja.size > 0) {
      msg += '*📱 Falhas de WhatsApp por loja:*\n'
      for (const [, { nome, recursos }] of porLoja) {
        msg += `\n*${nome}*\n`
        for (const [feature, count] of recursos) {
          msg += `  • ${feature} — ${count}x\n`
        }
      }
    }

    msg += '\nVeja detalhes em Configurações → SuperAdmin → Central de Erros.'

    if (DONO_PHONE) {
      await sendWhatsAppText(normalizeBrPhone(DONO_PHONE), msg)
    }

    return new Response(JSON.stringify({ ok: true, problemas: true, crons: cronsFalhando.size, lojas: porLoja.size }), { status: 200, headers: CORS })
  } catch (err) {
    console.error('system-health-check error:', err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: CORS })
  }
})
