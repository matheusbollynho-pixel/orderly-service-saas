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

function onlyDigits(v: string) {
  return v?.replace(/\D/g, '') || ''
}

const ASAAS_URL = 'https://api.asaas.com/v3'

async function asaasRequest(apiKey: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`${ASAAS_URL}${path}`, {
    method,
    headers: {
      'access_token': apiKey,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.errors?.[0]?.description || JSON.stringify(data))
  return data
}

async function findOrCreateCustomer(apiKey: string, name: string, phone: string, cpf: string | null, externalRef: string) {
  const cpfClean = onlyDigits(cpf || '')
  const phoneClean = onlyDigits(phone || '')

  // Busca por CPF primeiro — garante que o cliente no Asaas tem CPF
  if (cpfClean.length === 11) {
    const found = await asaasRequest(apiKey, 'GET', `/customers?cpfCnpj=${cpfClean}&limit=1`).catch(() => null)
    if (found?.data?.length > 0) return found.data[0].id
  }

  // Busca por externalReference
  if (externalRef) {
    const found = await asaasRequest(apiKey, 'GET', `/customers?externalReference=${externalRef}&limit=1`).catch(() => null)
    if (found?.data?.length > 0) {
      const c = found.data[0]
      // Se o cliente foi criado sem CPF e agora temos um, atualiza
      if (cpfClean.length === 11 && !c.cpfCnpj) {
        await asaasRequest(apiKey, 'PUT', `/customers/${c.id}`, { cpfCnpj: cpfClean }).catch(() => null)
      }
      return c.id
    }
  }

  const payload: Record<string, string> = {
    name: name || 'Cliente',
    mobilePhone: phoneClean,
  }
  if (cpfClean.length === 11) payload.cpfCnpj = cpfClean
  if (externalRef) payload.externalReference = externalRef

  const created = await asaasRequest(apiKey, 'POST', '/customers', payload)
  return created.id
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const body = await req.json()
    const order_id: string = body.order_id
    const billing_type: string = body.billing_type ?? 'UNDEFINED'
    const due_days: number = body.due_days ?? 3
    const installment_count: number = body.installment_count ?? 1
    const amount_override: number | null = body.amount != null ? Number(body.amount) : null
    const client_name_override: string | null = body.client_name ?? null
    const client_phone_override: string | null = body.client_phone ?? null
    const client_cpf_override: string | null = body.client_cpf ?? null

    if (!order_id) return json({ error: 'order_id obrigatorio' }, 400)

    const { data: settings } = await supabase
      .from('store_settings')
      .select('asaas_api_key, company_name')
      .limit(1)
      .maybeSingle()

    const apiKey: string = settings?.asaas_api_key ?? ''
    if (!apiKey) return json({ error: 'API Key do Asaas nao configurada. Va em Configuracoes -> Loja.' }, 400)

    let clientName = client_name_override || 'Cliente'
    let clientPhone = client_phone_override || ''
    let cpf: string | null = client_cpf_override
    let pending = 0

    if (amount_override != null && amount_override > 0) {
      // Modo direto (Nota de Balcao)
      pending = amount_override
    } else if (amount_override == null) {
      // Modo OS: calcula da base de dados
      const { data: order } = await supabase
        .from('service_orders')
        .select('id, client_name, client_phone, client_id, client_cpf')
        .eq('id', order_id)
        .single()

      if (!order) return json({ error: 'OS nao encontrada' }, 404)

      clientName = order.client_name || 'Cliente'
      clientPhone = order.client_phone || ''
      // CPF direto na OS (campo client_cpf na service_orders)
      if (order.client_cpf) cpf = order.client_cpf

      const { data: materials } = await supabase
        .from('materials')
        .select('valor, quantidade')
        .eq('order_id', order_id)

      const { data: payments } = await supabase
        .from('payments')
        .select('amount, discount_amount')
        .eq('order_id', order_id)

      const totalOS = (materials || []).reduce((s: number, m: Record<string, unknown>) =>
        s + ((Number(m.valor) || 0) * (parseFloat(String(m.quantidade)) || 0)), 0)
      const totalPaid = (payments || []).reduce((s: number, p: Record<string, unknown>) =>
        s + (Number(p.amount) || 0) + (Number(p.discount_amount) || 0), 0)
      pending = Math.max(totalOS - totalPaid, 0)

      // Complementa com dados do cliente cadastrado
      if (order.client_id) {
        const { data: client } = await supabase
          .from('clients')
          .select('cpf, phone')
          .eq('id', order.client_id)
          .maybeSingle()
        if (!cpf && client?.cpf) cpf = client.cpf
        if (!clientPhone && client?.phone) clientPhone = client.phone
      }
    } else {
      return json({ error: 'Valor invalido ou zerado' }, 400)
    }

    if (pending <= 0) return json({ error: 'Sem saldo pendente' }, 400)

    const customerId = await findOrCreateCustomer(apiKey, clientName, clientPhone, cpf, order_id)

    const dueDate = new Date()
    dueDate.setDate(dueDate.getDate() + due_days)
    const dueDateStr = dueDate.toISOString().split('T')[0]

    const chargePayload: Record<string, unknown> = {
      customer: customerId,
      billingType: billing_type,
      value: parseFloat(pending.toFixed(2)),
      dueDate: dueDateStr,
      description: `Nota #${order_id.slice(0, 8)} - ${settings?.company_name || 'Loja'}`,
      externalReference: order_id,
      postalService: false,
      sendPaymentByPostalService: false,
    }

    if (billing_type === 'CREDIT_CARD' && installment_count > 1) {
      chargePayload.installmentCount = installment_count
      chargePayload.installmentValue = parseFloat((pending / installment_count).toFixed(2))
    }

    const charge = await asaasRequest(apiKey, 'POST', '/payments', chargePayload)

    return json({
      ok: true,
      charge_id: charge.id,
      value: charge.value,
      due_date: charge.dueDate,
      invoice_url: charge.invoiceUrl,
      bank_slip_url: charge.bankSlipUrl || null,
      pix_qr_code: charge.pixQrCodeId || null,
      status: charge.status,
    })

  } catch (err) {
    console.error('asaas-cobranca error:', String(err))
    const msg = err instanceof Error ? err.message : String(err)
    return json({ error: msg }, 500)
  }
})
