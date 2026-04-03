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

function toISODate(): string {
  return new Date().toISOString().split('T')[0]
}

// ── Nota de Balcão ─────────────────────────────────────────────────────────
async function finalizarBalcao(orderId: string, valor: number, metodo: string, asaasPaymentId: string) {
  const { data: order, error: fetchErr } = await supabase
    .from('balcao_orders')
    .select('*, balcao_items(*)')
    .eq('id', orderId)
    .maybeSingle()

  if (fetchErr) throw fetchErr
  if (!order) return { skipped: true, reason: 'Nota de balcão não encontrada' }
  if (order.status === 'finalizada') return { skipped: true, reason: 'Nota já finalizada' }

  // Evita duplicata: verifica se esse pagamento Asaas já foi registrado
  const { data: existingCf } = await supabase
    .from('cash_flow')
    .select('id')
    .eq('balcao_order_id', orderId)
    .ilike('notes', `%${asaasPaymentId}%`)
    .maybeSingle()

  if (existingCf) return { skipped: true, reason: 'Pagamento Asaas já registrado' }

  const items: { type: string; product_id: string | null; quantity: number; unit_price: number; description: string }[]
    = order.balcao_items ?? []

  // ── Calcular total efetivo da nota (com desconto) ──────────────────────
  const subtotal = items.reduce((s, i) => s + i.unit_price * i.quantity, 0)
  const effectiveTotal = order.discount_pct > 0
    ? subtotal * (1 - order.discount_pct / 100)
    : subtotal

  // ── Pagamentos manuais já registrados na nota (payment_methods JSON) ───
  const manualPayments: { method: string; amount: number }[] =
    Array.isArray(order.payment_methods) ? order.payment_methods : []
  const totalManual = manualPayments.reduce((s, p) => s + (p.amount || 0), 0)

  // ── Pagamentos Asaas anteriores já no cash_flow ────────────────────────
  const { data: cfPrev } = await supabase
    .from('cash_flow')
    .select('amount')
    .eq('balcao_order_id', orderId)
  const totalCfPrev = (cfPrev || []).reduce((s: number, r: { amount: number }) => s + (r.amount || 0), 0)

  const totalPaidAfter = totalManual + totalCfPrev + valor

  console.log(`Balcão ${orderId.slice(0, 8)}: total=${effectiveTotal.toFixed(2)} manual=${totalManual.toFixed(2)} cf_prev=${totalCfPrev.toFixed(2)} asaas=${valor.toFixed(2)} soma=${totalPaidAfter.toFixed(2)}`)

  // ── Registra pagamento no caixa ────────────────────────────────────────
  const itemsSummary = items.map(i => `${i.quantity}x ${i.description}`).join(', ')
  const description = `Nota Balcão${order.client_name ? ` - ${order.client_name}` : ''}: ${itemsSummary}`

  const { error: cfErr } = await supabase.from('cash_flow').insert({
    type: 'entrada',
    amount: valor,
    description,
    category: 'venda_balcao',
    payment_method: metodo,
    date: toISODate(),
    notes: `Pago via Asaas (${asaasPaymentId})`,
    balcao_order_id: orderId,
  })
  if (cfErr) throw cfErr

  // ── Finaliza só se o total pago cobre o valor da nota ─────────────────
  if (totalPaidAfter < effectiveTotal - 0.01) {
    return { ok: true, order_id: orderId, amount: valor, method: metodo, status: 'parcial', faltam: effectiveTotal - totalPaidAfter }
  }

  // Movimentações de estoque
  let firstMovId: string | null = null
  for (const item of items) {
    if (item.type === 'estoque' && item.product_id) {
      const { data: mov, error: movErr } = await supabase
        .from('inventory_movements')
        .insert({
          product_id: item.product_id,
          type: 'saida_balcao',
          quantity: item.quantity,
          unit_price: item.unit_price,
          notes: `Nota Balcão #${orderId.slice(0, 8)}${order.client_name ? ` - ${order.client_name}` : ''} (Asaas)`,
          balcao_order_id: orderId,
        })
        .select()
        .single()
      if (movErr) throw movErr
      if (!firstMovId) firstMovId = mov.id
    }
  }

  // Atualiza inventory_movement_id no primeiro cash_flow desta nota
  if (firstMovId) {
    await supabase
      .from('cash_flow')
      .update({ inventory_movement_id: firstMovId })
      .eq('balcao_order_id', orderId)
      .is('inventory_movement_id', null)
      .limit(1)
  }

  // Finaliza a nota
  const { error: updErr } = await supabase
    .from('balcao_orders')
    .update({ status: 'finalizada', finalized_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', orderId)
  if (updErr) throw updErr

  return { ok: true, order_id: orderId, amount: valor, method: metodo, status: 'finalizada' }
}

// ── OS ─────────────────────────────────────────────────────────────────────
async function finalizarOS(orderId: string, valor: number, metodo: string, asaasPaymentId: string) {
  const { data: order, error: fetchErr } = await supabase
    .from('service_orders')
    .select('id, status, client_name, equipment')
    .eq('id', orderId)
    .maybeSingle()

  if (fetchErr) throw fetchErr
  if (!order) return { skipped: true, reason: 'OS não encontrada' }

  // Evita duplicata
  const { data: existing } = await supabase
    .from('payments')
    .select('id')
    .eq('order_id', orderId)
    .eq('reference', asaasPaymentId)
    .maybeSingle()

  if (existing) return { skipped: true, reason: 'Pagamento já registrado' }

  // Registra pagamento (trigger do banco cria o cash_flow automaticamente)
  const { error: payErr } = await supabase.from('payments').insert({
    order_id: orderId,
    amount: valor,
    discount_amount: 0,
    method: metodo,
    reference: asaasPaymentId,
    notes: 'Pago via Asaas',
  })
  if (payErr) throw payErr

  // Calcula total da OS e total pago
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

  console.log(`OS ${orderId.slice(0, 8)}: total=${totalOS.toFixed(2)} pago=${totalPaid.toFixed(2)}`)

  // Finaliza só se cobre o total
  if (totalPaid >= totalOS - 0.01 && totalOS > 0 && order.status !== 'concluida_entregue') {
    await supabase
      .from('service_orders')
      .update({ status: 'concluida_entregue', exit_date: new Date().toISOString() })
      .eq('id', orderId)
    return { ok: true, order_id: orderId, amount: valor, method: metodo, status: 'concluida_entregue' }
  }

  return { ok: true, order_id: orderId, amount: valor, method: metodo, status: 'parcial', faltam: totalOS - totalPaid }
}

// ── Fiado ───────────────────────────────────────────────────────────────────
async function finalizarFiado(fiadoId: string, valor: number, metodo: string, asaasPaymentId: string) {
  const { data: fiado, error: fetchErr } = await supabase
    .from('fiados')
    .select('id, client_name, amount_paid, original_amount, interest_accrued, status, origin_type, origin_id')
    .eq('id', fiadoId)
    .maybeSingle()

  if (fetchErr) throw fetchErr
  if (!fiado) return { skipped: true, reason: 'Fiado não encontrado' }
  if (fiado.status === 'pago') return { skipped: true, reason: 'Fiado já quitado' }

  // Evita duplicata
  const { data: existing } = await supabase
    .from('fiado_payments')
    .select('id')
    .eq('fiado_id', fiadoId)
    .eq('notes', `Asaas ${asaasPaymentId}`)
    .maybeSingle()
  if (existing) return { skipped: true, reason: 'Pagamento Asaas já registrado' }

  // Registra o pagamento
  await supabase.from('fiado_payments').insert({
    fiado_id: fiadoId,
    amount: valor,
    method: metodo,
    notes: `Asaas ${asaasPaymentId}`,
    received_by: 'Asaas',
  })

  // Atualiza saldo e status
  const newAmountPaid = (fiado.amount_paid || 0) + valor
  const totalOwed = (fiado.original_amount || 0) + (fiado.interest_accrued || 0)
  const newStatus = newAmountPaid >= totalOwed ? 'pago' : 'parcial'

  await supabase.from('fiados').update({
    amount_paid: newAmountPaid,
    status: newStatus,
    updated_at: new Date().toISOString(),
  }).eq('id', fiadoId)

  // Se quitado, finaliza nota de balcão (OS já foi marcada como entregue na criação do fiado)
  if (newStatus === 'pago' && fiado.origin_id && fiado.origin_type === 'balcao') {
    await supabase.from('balcao_orders').update({ status: 'finalizada' }).eq('id', fiado.origin_id)
  }

  // Lança no caixa
  await supabase.from('cash_flow').insert({
    type: 'entrada',
    description: `Fiado recebido - ${fiado.client_name || 'Cliente'}`,
    amount: valor,
    payment_method: metodo,
    date: toISODate(),
    notes: `Pago via Asaas (${asaasPaymentId})`,
  })

  console.log(`Fiado ${fiadoId.slice(0, 8)}: pago R$${valor} status=${newStatus}`)
  return { ok: true, fiado_id: fiadoId, amount: valor, method: metodo, status: newStatus }
}

// ── Servidor ───────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const body = await req.json()
    const event = body?.event
    const payment = body?.payment

    console.log('asaas-webhook event:', event, 'ref:', payment?.externalReference, 'id:', payment?.id)

    if (!['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED'].includes(event)) {
      return json({ skipped: true, event })
    }

    const orderId = payment?.externalReference
    if (!orderId) return json({ skipped: true, reason: 'Sem externalReference' })

    const valor = parseFloat(payment?.value || '0')
    const metodo = mapBillingType(payment?.billingType || '')
    const asaasPaymentId: string = payment?.id || ''

    // Tenta OS primeiro
    const { data: os } = await supabase
      .from('service_orders')
      .select('id')
      .eq('id', orderId)
      .maybeSingle()

    if (os) {
      const result = await finalizarOS(orderId, valor, metodo, asaasPaymentId)
      return json(result)
    }

    // Tenta nota de balcão
    const { data: balcao } = await supabase
      .from('balcao_orders')
      .select('id')
      .eq('id', orderId)
      .maybeSingle()

    if (balcao) {
      const result = await finalizarBalcao(orderId, valor, metodo, asaasPaymentId)
      return json(result)
    }

    // Tenta fiado (externalReference = "fiado-{uuid}")
    if (orderId.startsWith('fiado-')) {
      const fiadoId = orderId.replace('fiado-', '')
      const result = await finalizarFiado(fiadoId, valor, metodo, asaasPaymentId)
      return json(result)
    }

    return json({ skipped: true, reason: 'Pedido não encontrado em OS, Balcão nem Fiado' })

  } catch (err) {
    console.error('asaas-webhook error:', err)
    return json({ error: String(err) }, 500)
  }
})
