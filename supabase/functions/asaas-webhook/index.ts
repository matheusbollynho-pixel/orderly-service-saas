import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const ASAAS_API_KEY = Deno.env.get('ASAAS_API_KEY')!
const ASAAS_WEBHOOK_TOKEN = Deno.env.get('ASAAS_WEBHOOK_TOKEN')!
const ASAAS_API_URL = 'https://api.asaas.com/v3'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, asaas-access-token',
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

function planFromRef(ref: string): string | null {
  if (!ref) return null
  const r = ref.toLowerCase()
  if (r.includes('basico') || r.includes('básico') || r.includes('basic')) return 'basic'
  if (r.includes('profissional') || r.includes('pro')) return 'pro'
  if (r.includes('premium') || r.includes('enterprise')) return 'enterprise'
  return null
}

function planFromValue(value: number): string {
  if (value <= 90) return 'basic'
  if (value <= 160) return 'pro'
  return 'enterprise'
}

// ── Buscar dados do cliente no Asaas ─────────────────────────────────────────
async function fetchAsaasCustomer(customerId: string) {
  const res = await fetch(`${ASAAS_API_URL}/customers/${customerId}`, {
    headers: { 'access_token': ASAAS_API_KEY },
  })
  if (!res.ok) return null
  return await res.json()
}

// ── Provisionar novo cliente SaaS ─────────────────────────────────────────────
async function provisionarCliente(payment: Record<string, unknown>) {
  const asaasPaymentId = payment.id as string
  const asaasCustomerId = payment.customer as string
  const valor = parseFloat(String(payment.value || '0'))
  const externalRef = (payment.externalReference as string) || ''
  const subscriptionId = (payment.subscription as string) || null

  // Determina o plano
  const plan = planFromRef(externalRef) || planFromValue(valor)

  console.log(`Provisionando: asaas_payment=${asaasPaymentId} customer=${asaasCustomerId} plan=${plan} valor=${valor}`)

  // Evita duplicata — verifica se já existe store com esse asaas_customer_id
  const { data: existingStore } = await supabase
    .from('store_settings')
    .select('id, owner_email')
    .eq('asaas_customer_id', asaasCustomerId)
    .maybeSingle()

  if (existingStore) {
    // Cliente já existe — atualiza plano e registra renovação
    console.log(`Cliente já existe (${existingStore.id}) — registrando renovação`)
    await supabase.from('store_settings')
      .update({ plan, active: true, updated_at: new Date().toISOString() })
      .eq('id', existingStore.id)

    await supabase.from('saas_subscriptions').insert({
      store_id: existingStore.id,
      asaas_payment_id: asaasPaymentId,
      asaas_customer_id: asaasCustomerId,
      plan,
      status: 'active',
      owner_email: existingStore.owner_email,
      owner_name: existingStore.owner_email,
      amount: valor,
      paid_at: new Date().toISOString(),
    })

    return { ok: true, action: 'renovacao', store_id: existingStore.id, plan }
  }

  // Cliente novo — buscar dados no Asaas (ou usar dados de teste)
  const customer = (payment._customer as Record<string, unknown>) || await fetchAsaasCustomer(asaasCustomerId)
  if (!customer) {
    throw new Error(`Cliente Asaas não encontrado: ${asaasCustomerId}`)
  }

  const ownerEmail = customer.email as string
  const ownerName = (customer.company || customer.name) as string
  const ownerPhone = (customer.mobilePhone || customer.phone || '') as string
  const companyName = (customer.company || customer.name) as string

  if (!ownerEmail) {
    throw new Error(`Cliente ${asaasCustomerId} não tem email cadastrado no Asaas`)
  }

  console.log(`Novo cliente: ${ownerName} <${ownerEmail}> plano=${plan}`)

  // Criar store em store_settings
  const subdomain = ownerEmail.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '') + Date.now().toString().slice(-4)

  const { data: newStore, error: storeErr } = await supabase
    .from('store_settings')
    .insert({
      company_name: companyName,
      owner_email: ownerEmail,
      store_phone: ownerPhone,
      subdomain,
      plan,
      active: true,
      onboarded: false,
      asaas_customer_id: asaasCustomerId,
    })
    .select('id')
    .single()

  if (storeErr || !newStore) {
    throw new Error(`Erro ao criar store: ${storeErr?.message}`)
  }

  const storeId = newStore.id
  console.log(`Store criada: ${storeId}`)

  // Criar usuário no Supabase Auth e enviar convite
  const { data: inviteData, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(ownerEmail, {
    data: { store_id: storeId, plan, company_name: companyName },
    redirectTo: `https://app.speedseekos.com.br/`,
  })

  if (inviteErr) {
    console.error(`Erro ao convidar usuário: ${inviteErr.message}`)
    // Não lança erro — store já foi criada, pode reenviar depois
  } else {
    const userId = inviteData?.user?.id
    console.log(`Usuário convidado: ${userId}`)

    if (userId) {
      // Criar store_member
      const { error: memberErr } = await supabase.from('store_members').insert({
        store_id: storeId,
        user_id: userId,
        role: 'owner',
        active: true,
        email: ownerEmail,
      })
      if (memberErr) console.error(`Erro ao criar store_member: ${memberErr.message}`)
    }
  }

  // Registrar na saas_subscriptions
  await supabase.from('saas_subscriptions').insert({
    store_id: storeId,
    asaas_payment_id: asaasPaymentId,
    asaas_customer_id: asaasCustomerId,
    plan,
    status: 'active',
    owner_name: ownerName,
    owner_email: ownerEmail,
    owner_phone: ownerPhone,
    company_name: companyName,
    amount: valor,
    paid_at: new Date().toISOString(),
  })

  // Notificar dono (você) via WhatsApp
  const donoPhone = Deno.env.get('DONO_PHONE')
  if (donoPhone) {
    const msg = `🎉 *Novo cliente SpeedSeekOS!*\n\n👤 ${ownerName}\n📧 ${ownerEmail}\n📱 ${ownerPhone}\n💼 Plano: ${plan.toUpperCase()}\n💰 R$ ${valor.toFixed(2)}\n\n✅ Conta criada automaticamente. Email de acesso enviado!`
    await supabase.functions.invoke('enviar-documento-whatsapp', {
      body: { phone: donoPhone, text: msg, type: 'text' },
    }).catch(() => null)
  }

  return { ok: true, action: 'novo_cliente', store_id: storeId, plan, email: ownerEmail }
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

  const { data: existingCf } = await supabase
    .from('cash_flow')
    .select('id')
    .eq('balcao_order_id', orderId)
    .ilike('notes', `%${asaasPaymentId}%`)
    .maybeSingle()

  if (existingCf) return { skipped: true, reason: 'Pagamento Asaas já registrado' }

  const items: { type: string; product_id: string | null; quantity: number; unit_price: number; description: string }[]
    = order.balcao_items ?? []

  const subtotal = items.reduce((s, i) => s + i.unit_price * i.quantity, 0)
  const effectiveTotal = order.discount_pct > 0
    ? subtotal * (1 - order.discount_pct / 100)
    : subtotal

  const manualPayments: { method: string; amount: number }[] =
    Array.isArray(order.payment_methods) ? order.payment_methods : []
  const totalManual = manualPayments.reduce((s, p) => s + (p.amount || 0), 0)

  const { data: cfPrev } = await supabase
    .from('cash_flow')
    .select('amount')
    .eq('balcao_order_id', orderId)
  const totalCfPrev = (cfPrev || []).reduce((s: number, r: { amount: number }) => s + (r.amount || 0), 0)

  const totalPaidAfter = totalManual + totalCfPrev + valor

  const itemsSummary = items.map(i => `${i.quantity}x ${i.description}`).join(', ')
  const description = `Nota Balcão${order.client_name ? ` - ${order.client_name}` : ''}: ${itemsSummary}`

  const { error: cfErr } = await supabase.from('cash_flow').insert({
    store_id: order.store_id,
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

  if (totalPaidAfter < effectiveTotal - 0.01) {
    return { ok: true, order_id: orderId, amount: valor, method: metodo, status: 'parcial' }
  }

  let firstMovId: string | null = null
  for (const item of items) {
    if (item.type === 'estoque' && item.product_id) {
      const { data: mov, error: movErr } = await supabase
        .from('inventory_movements')
        .insert({
          store_id: order.store_id,
          product_id: item.product_id,
          type: 'saida_balcao',
          quantity: item.quantity,
          unit_price: item.unit_price,
          notes: `Nota Balcão #${orderId.slice(0, 8)} (Asaas)`,
          balcao_order_id: orderId,
        })
        .select()
        .single()
      if (movErr) throw movErr
      if (!firstMovId) firstMovId = mov.id
    }
  }

  if (firstMovId) {
    await supabase.from('cash_flow')
      .update({ inventory_movement_id: firstMovId })
      .eq('balcao_order_id', orderId)
      .is('inventory_movement_id', null)
      .limit(1)
  }

  await supabase.from('balcao_orders')
    .update({ status: 'finalizada', finalized_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', orderId)

  return { ok: true, order_id: orderId, amount: valor, method: metodo, status: 'finalizada' }
}

// ── OS ─────────────────────────────────────────────────────────────────────
async function finalizarOS(orderId: string, valor: number, metodo: string, asaasPaymentId: string) {
  const { data: order, error: fetchErr } = await supabase
    .from('service_orders')
    .select('id, status, client_name, equipment, store_id')
    .eq('id', orderId)
    .maybeSingle()

  if (fetchErr) throw fetchErr
  if (!order) return { skipped: true, reason: 'OS não encontrada' }

  const { data: existing } = await supabase
    .from('payments')
    .select('id')
    .eq('order_id', orderId)
    .eq('reference', asaasPaymentId)
    .maybeSingle()

  if (existing) return { skipped: true, reason: 'Pagamento já registrado' }

  const { error: payErr } = await supabase.from('payments').insert({
    store_id: order.store_id,
    order_id: orderId,
    amount: valor,
    discount_amount: 0,
    method: metodo,
    reference: asaasPaymentId,
    notes: 'Pago via Asaas',
  })
  if (payErr) throw payErr

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

  if (totalPaid >= totalOS - 0.01 && totalOS > 0 && order.status !== 'concluida_entregue') {
    await supabase.from('service_orders')
      .update({ status: 'concluida_entregue', exit_date: new Date().toISOString() })
      .eq('id', orderId)
    return { ok: true, order_id: orderId, amount: valor, method: metodo, status: 'concluida_entregue' }
  }

  return { ok: true, order_id: orderId, amount: valor, method: metodo, status: 'parcial' }
}

// ── Fiado ───────────────────────────────────────────────────────────────────
async function finalizarFiado(fiadoId: string, valor: number, metodo: string, asaasPaymentId: string) {
  const { data: fiado, error: fetchErr } = await supabase
    .from('fiados')
    .select('id, client_name, amount_paid, original_amount, interest_accrued, status, origin_type, origin_id, store_id')
    .eq('id', fiadoId)
    .maybeSingle()

  if (fetchErr) throw fetchErr
  if (!fiado) return { skipped: true, reason: 'Fiado não encontrado' }
  if (fiado.status === 'pago') return { skipped: true, reason: 'Fiado já quitado' }

  const { data: existing } = await supabase
    .from('fiado_payments')
    .select('id')
    .eq('fiado_id', fiadoId)
    .eq('notes', `Asaas ${asaasPaymentId}`)
    .maybeSingle()
  if (existing) return { skipped: true, reason: 'Pagamento Asaas já registrado' }

  await supabase.from('fiado_payments').insert({
    store_id: fiado.store_id,
    fiado_id: fiadoId,
    amount: valor,
    method: metodo,
    notes: `Asaas ${asaasPaymentId}`,
    received_by: 'Asaas',
  })

  const newAmountPaid = (fiado.amount_paid || 0) + valor
  const totalOwed = (fiado.original_amount || 0) + (fiado.interest_accrued || 0)
  const newStatus = newAmountPaid >= totalOwed ? 'pago' : 'parcial'

  await supabase.from('fiados').update({
    amount_paid: newAmountPaid,
    status: newStatus,
    updated_at: new Date().toISOString(),
  }).eq('id', fiadoId)

  if (newStatus === 'pago' && fiado.origin_id && fiado.origin_type === 'balcao') {
    await supabase.from('balcao_orders').update({ status: 'finalizada' }).eq('id', fiado.origin_id)
  }

  await supabase.from('cash_flow').insert({
    store_id: fiado.store_id,
    type: 'entrada',
    description: `Fiado recebido - ${fiado.client_name || 'Cliente'}`,
    amount: valor,
    payment_method: metodo,
    date: toISODate(),
    notes: `Pago via Asaas (${asaasPaymentId})`,
  })

  return { ok: true, fiado_id: fiadoId, amount: valor, method: metodo, status: newStatus }
}

// ── Servidor ───────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    // Verificar token de autenticação do Asaas
    // Aceita também service_role key no Authorization header (para testes internos)
    const webhookToken = req.headers.get('asaas-access-token')
    const authHeader = req.headers.get('authorization') || ''
    const isServiceRole = authHeader === `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
    if (ASAAS_WEBHOOK_TOKEN && webhookToken !== ASAAS_WEBHOOK_TOKEN && !isServiceRole) {
      console.warn('Token inválido:', webhookToken)
      return json({ error: 'Unauthorized' }, 401)
    }

    const body = await req.json()
    const event = body?.event as string
    const payment = body?.payment as Record<string, unknown>

    console.log('asaas-webhook event:', event, 'ref:', payment?.externalReference, 'id:', payment?.id)

    if (!['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED'].includes(event)) {
      return json({ skipped: true, event })
    }

    const externalRef = (payment?.externalReference as string) || ''
    const valor = parseFloat(String(payment?.value || '0'))
    const metodo = mapBillingType((payment?.billingType as string) || '')
    const asaasPaymentId: string = (payment?.id as string) || ''

    // ── Detectar se é provisionamento SaaS ─────────────────────────────────
    // Referências de planos SaaS: "basico", "profissional", "premium" (e variações)
    // Referências internas de OS/Balcão/Fiado: UUIDs ou "fiado-{uuid}"
    const isSaasRef = planFromRef(externalRef) !== null
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(externalRef)
    const isFiado = externalRef.startsWith('fiado-')

    if (!isUUID && !isFiado && (isSaasRef || !externalRef)) {
      // É pagamento de assinatura SaaS
      const result = await provisionarCliente(payment)
      return json(result)
    }

    // ── Pagamento interno (OS / Balcão / Fiado) ─────────────────────────────
    const orderId = externalRef

    if (isFiado) {
      const fiadoId = orderId.replace('fiado-', '')
      const result = await finalizarFiado(fiadoId, valor, metodo, asaasPaymentId)
      return json(result)
    }

    // Tenta OS
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

    return json({ skipped: true, reason: 'Referência não reconhecida', externalRef })

  } catch (err) {
    console.error('asaas-webhook error:', err)
    return json({ error: String(err) }, 500)
  }
})
