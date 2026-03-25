/**
 * fiado-ia-agenda
 * Chamado após cada envio de cobrança (manual ou automático).
 * Usa Claude para analisar o contexto do fiado e decidir
 * quando enviar a próxima mensagem (next_reminder_at).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function askClaude(prompt: string): Promise<string> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY') || ''
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY não configurada')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(JSON.stringify(data))
  return data.content?.[0]?.text || ''
}

function daysFromNow(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { fiado_id } = await req.json()
    if (!fiado_id) {
      return new Response(JSON.stringify({ error: 'fiado_id obrigatório' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    const { data: fiado, error } = await sb
      .from('fiados')
      .select('*, fiado_payments(*), fiado_messages(*)')
      .eq('id', fiado_id)
      .single()

    if (error || !fiado) {
      return new Response(JSON.stringify({ error: 'Fiado não encontrado' }), { status: 404, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    const today = new Date().toISOString().split('T')[0]
    const daysOverdue = Math.max(0, Math.floor(
      (Date.now() - new Date(fiado.due_date + 'T00:00:00').getTime()) / (1000 * 60 * 60 * 24)
    ))
    const balance = Math.max(
      (fiado.original_amount || 0) + (fiado.interest_accrued || 0) - (fiado.amount_paid || 0),
      0
    )
    const lastLevel = fiado.last_reminder_level || 0
    const paymentsCount = (fiado.fiado_payments || []).length
    const messagesCount = (fiado.fiado_messages || []).length

    const lastPaymentDate = paymentsCount > 0
      ? (fiado.fiado_payments as { paid_at: string }[])
          .sort((a, b) => b.paid_at.localeCompare(a.paid_at))[0].paid_at.split('T')[0]
      : null

    const prompt = `Você é um sistema de cobrança inteligente de uma oficina de motos. Analise este devedor e decida QUANDO enviar a próxima mensagem de cobrança.

DADOS:
- Dias em atraso: ${daysOverdue}
- Saldo devedor: R$ ${balance.toFixed(2)}
- Status: ${fiado.status}
- Último nível de cobrança enviado: ${lastLevel}/4
- Total de mensagens enviadas: ${messagesCount}
- Pagamentos parciais realizados: ${paymentsCount}
- Data do último pagamento parcial: ${lastPaymentDate || 'nenhum'}
- Data atual: ${today}

LÓGICA:
- Se cliente fez pagamento parcial recente (últimos 5 dias): aguardar 7 dias
- Nível 1 → próxima em 3 dias
- Nível 2 → próxima em 4 dias
- Nível 3 → próxima em 5 dias
- Nível 4 → próxima em 7 dias
- Nunca marcar para domingo (dia da semana 0)
- Se já no nível 4 há mais de 30 dias sem pagamento: manter a cada 14 dias

Responda APENAS com JSON válido, sem texto extra:
{"next_date": "YYYY-MM-DD", "next_level": 1, "reason": "motivo em uma frase"}`

    let nextDate = daysFromNow(3)
    let nextLevel = Math.min(lastLevel + 1, 4)
    let reason = 'agendamento padrão'

    try {
      const raw = await askClaude(prompt)
      const match = raw.match(/\{[\s\S]*?\}/)
      if (match) {
        const parsed = JSON.parse(match[0])
        if (parsed.next_date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.next_date)) {
          nextDate = parsed.next_date
        }
        if (typeof parsed.next_level === 'number') {
          nextLevel = Math.min(Math.max(parsed.next_level, 1), 4)
        }
        if (parsed.reason) reason = parsed.reason
      }
    } catch (aiErr) {
      console.warn('Claude falhou, usando fallback:', aiErr)
    }

    // Avoid Sundays
    const scheduled = new Date(nextDate + 'T08:00:00Z')
    if (scheduled.getDay() === 0) {
      scheduled.setDate(scheduled.getDate() + 1) // move to Monday
    }

    await sb.from('fiados').update({
      next_reminder_at: scheduled.toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', fiado_id)

    console.log(`📅 IA agendou próxima cobrança de ${fiado.client_name} para ${scheduled.toISOString().split('T')[0]} — nível ${nextLevel}: ${reason}`)

    return new Response(JSON.stringify({
      ok: true,
      next_reminder_at: scheduled.toISOString(),
      next_level: nextLevel,
      reason,
    }), { headers: { ...CORS, 'Content-Type': 'application/json' } })

  } catch (err) {
    console.error('fiado-ia-agenda error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
