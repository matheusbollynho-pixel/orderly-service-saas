/**
 * fiado-cobranca-auto
 * Cron diário que:
 * 1. Envia cobranças para fiados onde next_reminder_at <= agora
 * 2. Inicia o agendamento para fiados recém-vencidos (sem next_reminder_at)
 * 3. Chama a IA (Claude) para decidir a próxima data de cobrança
 * 4. Calcula juros compostos mensais
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendWhatsAppText, normalizeBrPhone } from '../_shared/whatsapp.ts'

const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

function calcDaysOverdue(dueDateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const [y, m, d] = dueDateStr.split('-').map(Number)
  const due = new Date(y, m - 1, d)
  return Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24))
}

function calcInterest(originalAmount: number, rateMonthly: number, daysOverdue: number): number {
  if (daysOverdue <= 0) return 0
  return originalAmount * (rateMonthly / 100) * (daysOverdue / 30)
}

function levelFromDays(days: number): number {
  if (days <= 2) return 1
  if (days <= 6) return 2
  if (days <= 14) return 3
  return 4
}

function daysFromNow(n: number): string {
  const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().split('T')[0]
}

async function askClaudeForNextDate(fiado: Record<string, unknown>, balance: number, daysOverdue: number): Promise<{ nextDate: string; nextLevel: number; reason: string }> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY') || ''
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY não configurada')

  const lastLevel = (fiado.last_reminder_level as number) || 0
  const paymentsCount = ((fiado.fiado_payments as unknown[]) || []).length
  const lastPaymentDate = paymentsCount > 0
    ? ((fiado.fiado_payments as { paid_at: string }[]).sort((a, b) => b.paid_at.localeCompare(a.paid_at))[0].paid_at || '').split('T')[0]
    : null

  const today = new Date().toISOString().split('T')[0]

  const prompt = `Você é um sistema de cobrança de uma oficina de motos. Decida QUANDO enviar a próxima cobrança.

DADOS:
- Dias em atraso: ${daysOverdue}
- Saldo devedor: R$ ${balance.toFixed(2)}
- Último nível enviado: ${lastLevel}/4
- Pagamentos parciais: ${paymentsCount}
- Último pagamento: ${lastPaymentDate || 'nenhum'}
- Data atual: ${today}

REGRAS:
- Pagamento parcial recente (≤5 dias): aguardar 7 dias
- Nível 1: próxima em 3 dias | Nível 2: 4 dias | Nível 3: 5 dias | Nível 4: 14 dias
- Nunca domingo (dia 0)

Responda APENAS JSON: {"next_date":"YYYY-MM-DD","next_level":1,"reason":"frase curta"}`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 200, messages: [{ role: 'user', content: prompt }] }),
  })
  const data = await res.json()
  const text = data.content?.[0]?.text || ''
  const match = text.match(/\{[\s\S]*?\}/)
  if (!match) throw new Error('Claude retornou formato inválido')

  const parsed = JSON.parse(match[0])
  const nextDate = /^\d{4}-\d{2}-\d{2}$/.test(parsed.next_date) ? parsed.next_date : daysFromNow(3)
  const nextLevel = Math.min(Math.max(Number(parsed.next_level) || lastLevel + 1, 1), 4)
  return { nextDate, nextLevel, reason: parsed.reason || '' }
}

async function processarFiados(): Promise<void> {
  const now = new Date().toISOString()
  const today = now.split('T')[0]

  console.log(`📅 fiado-cobranca-auto: ${today}`)

  const { data: settings } = await sb.from('store_settings').select('company_name').limit(1).maybeSingle()
  const storeName = settings?.company_name || 'Bandara Motos'

  // Fiados que a IA agendou para agora
  const { data: agendados } = await sb
    .from('fiados')
    .select('*')
    .neq('status', 'pago')
    .not('next_reminder_at', 'is', null)
    .lte('next_reminder_at', now)
    .limit(100)

  // Fiados recém-vencidos sem agendamento ainda
  const { data: novos } = await sb
    .from('fiados')
    .select('*')
    .neq('status', 'pago')
    .is('next_reminder_at', null)
    .lte('due_date', today)
    .limit(100)

  const fiados = [...(agendados || []), ...(novos || [])]
  if (fiados.length === 0) { console.log('✅ Nenhum fiado para processar'); return }

  console.log(`📬 ${fiados.length} fiado(s) para processar`)

  let enviados = 0, erros = 0

  for (const fiado of fiados) {
    try {
      const daysOverdue = calcDaysOverdue(fiado.due_date)
      if (daysOverdue <= 0) {
        // Ainda não venceu — limpar next_reminder_at se veio errado
        await sb.from('fiados').update({ next_reminder_at: null }).eq('id', fiado.id)
        continue
      }

      // Atualizar juros
      const newInterest = calcInterest(fiado.original_amount, fiado.interest_rate_monthly ?? 2, daysOverdue)
      await sb.from('fiados').update({ interest_accrued: newInterest, updated_at: now }).eq('id', fiado.id)

      const balance = Math.max((fiado.original_amount || 0) + newInterest - (fiado.amount_paid || 0), 0)
      const level = levelFromDays(daysOverdue)
      const name = (fiado.client_name || 'Cliente').split(' ')[0]
      const totalOwed = balance.toFixed(2)

      const messages: Record<number, string> = {
        1: `Olá ${name}! 😊 Passando para lembrar que você tem um valor pendente de *R$ ${totalOwed}* com a *${storeName}*. Qualquer dúvida estamos à disposição!`,
        2: `Olá ${name}, tudo bem?\n\nIdentificamos que seu débito de *R$ ${totalOwed}* com a *${storeName}* ainda está em aberto.\n\nPedimos que regularize o quanto antes para evitar maiores inconvenientes. Qualquer dúvida entre em contato!`,
        3: `Prezado(a) *${fiado.client_name}*,\n\nSeu débito de *R$ ${totalOwed}* com a *${storeName}* está em atraso.\n\n⚠️ O valor está sujeito a juros mensais. Caso não haja regularização em breve, o caso poderá ser encaminhado para cobrança extrajudicial.\n\nPor favor, entre em contato para regularizar sua situação.`,
        4: `*NOTIFICAÇÃO EXTRAJUDICIAL*\n\nPrezado(a) ${fiado.client_name},\n\nV.Sa. encontra-se em débito com a *${storeName}* no valor de *R$ ${totalOwed}*, vencido em ${fiado.due_date}.\n\nCaso não ocorra o pagamento em *48 horas*, seu nome será encaminhado ao *SERASA/SPC* e o crédito será remetido ao setor jurídico para propositura de ação de cobrança.\n\nRegularize sua situação imediatamente.`,
      }

      // Gerar/reutilizar link PIX Asaas para incluir na mensagem
      let paymentLink: string | null = fiado.asaas_payment_url || null
      if (!paymentLink) {
        try {
          const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
          const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
          const res = await fetch(`${supabaseUrl}/functions/v1/fiado-asaas-cobranca`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
            body: JSON.stringify({ fiado_id: fiado.id, billing_type: 'PIX' }),
          })
          const data = await res.json()
          if (data.ok && data.invoice_url) paymentLink = data.invoice_url
        } catch (e) {
          console.warn(`⚠️ Não foi possível gerar link Asaas para ${fiado.client_name}:`, e)
        }
      }

      const linkSuffix = paymentLink
        ? `\n\n💳 *Pague agora via PIX:*\n${paymentLink}`
        : ''

      const message = (messages[level] || messages[1]) + linkSuffix

      await sb.from('fiado_messages').insert([{ fiado_id: fiado.id, level, message, status: 'sent' }])
      await sb.from('fiados').update({ last_reminder_level: level, last_reminder_at: now }).eq('id', fiado.id)

      if (fiado.client_phone) {
        const phone = (fiado.client_phone as string).replace(/\D/g, '')
        if (phone.length >= 10) {
          try {
            await sendWhatsAppText(normalizeBrPhone(phone), message)
            console.log(`✅ Nível ${level} enviado para ${fiado.client_name}`)
            enviados++
          } catch (wErr) {
            console.error(`❌ WhatsApp para ${fiado.client_name}:`, wErr)
            erros++
          }
        }
      }

      // IA decide próxima data
      try {
        const { nextDate, nextLevel, reason } = await askClaudeForNextDate(fiado, balance, daysOverdue)
        const scheduled = new Date(nextDate + 'T08:00:00Z')
        if (scheduled.getDay() === 0) scheduled.setDate(scheduled.getDate() + 1) // evita domingo

        await sb.from('fiados').update({
          next_reminder_at: scheduled.toISOString(),
          updated_at: now,
        }).eq('id', fiado.id)

        console.log(`📅 IA agendou próxima para ${scheduled.toISOString().split('T')[0]} (nível ${nextLevel}): ${reason}`)
      } catch (aiErr) {
        // Fallback: 3 dias
        const fallback = new Date(); fallback.setDate(fallback.getDate() + 3)
        await sb.from('fiados').update({ next_reminder_at: fallback.toISOString() }).eq('id', fiado.id)
        console.warn(`⚠️ IA falhou para ${fiado.client_name}, usando fallback 3 dias:`, aiErr)
      }

    } catch (err) {
      console.error(`❌ Erro processando fiado ${fiado.id}:`, err)
      erros++
    }
  }

  console.log(`✅ Concluído. Enviados: ${enviados}, Erros: ${erros}`)
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  try {
    await processarFiados()
    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('fiado-cobranca-auto error:', err)
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
