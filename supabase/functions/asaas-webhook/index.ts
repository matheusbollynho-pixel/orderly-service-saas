import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

function mapBillingType(billingType: string): string {
  if (billingType === 'PIX') return 'pix'
  if (billingType === 'BOLETO') return 'outro'
  if (billingType === 'CREDIT_CARD') return 'cartao'
  return 'outro'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const body = await req.json()
    const event = body?.event
    const payment = body?.payment

    console.log('asaas-webhook event:', event)

    // Só processa confirmações de pagamento
    if (!['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED'].includes(event)) {
      return json({ skipped: true, event })
    }

    const orderId = payment?.externalReference
    if (!orderId) return json({ skipped: true, reason: 'Sem externalReference' })

    // Verifica se a OS existe
    const { data: order } = await supabase
      .from('service_orders')
      .select('id, status')
      .eq('id', orderId)
      .maybeSingle()

    if (!order) return json({ skipped: true, reason: 'OS não encontrada' })

    const valor = parseFloat(payment?.value || '0')
    const metodo = mapBillingType(payment?.billingType || '')

    // Verifica se já existe pagamento do Asaas para essa OS (evita duplicata)
    const { data: existingPayment } = await supabase
      .from('payments')
      .select('id')
      .eq('order_id', orderId)
      .eq('reference', payment?.id)
      .maybeSingle()

    if (existingPayment) {
      return json({ skipped: true, reason: 'Pagamento já registrado' })
    }

    // Registra o pagamento
    const { error: paymentError } = await supabase
      .from('payments')
      .insert({
        order_id: orderId,
        amount: valor,
        discount_amount: 0,
        method: metodo,
        reference: payment?.id,
        notes: `Pago via Asaas (${payment?.billingType})`,
      })

    if (paymentError) throw paymentError

    // Verifica se OS está totalmente paga
    const { data: materials } = await supabase
      .from('materials')
      .select('valor, quantidade')
      .eq('order_id', orderId)

    const { data: payments } = await supabase
      .from('payments')
      .select('amount, discount_amount')
      .eq('order_id', orderId)

    const totalOS = (materials || []).reduce((s, m) => s + ((m.valor || 0) * (parseFloat(m.quantidade) || 0)), 0)
    const totalPaid = (payments || []).reduce((s, p) => s + (p.amount || 0) + (p.discount_amount || 0), 0)

    // Se pagamento cobre o total, marca como concluída e entregue
    if (totalPaid >= totalOS && totalOS > 0 && order.status !== 'concluida_entregue') {
      await supabase
        .from('service_orders')
        .update({ status: 'concluida_entregue', exit_date: new Date().toISOString() })
        .eq('id', orderId)
    }

    return json({ ok: true, order_id: orderId, amount: valor, method: metodo })

  } catch (err) {
    console.error('asaas-webhook error:', err)
    return json({ error: String(err) }, 500)
  }
})
