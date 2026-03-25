/**
 * fiado-asaas-cobranca
 * Cria uma cobrança Asaas (PIX ou Boleto) para um fiado,
 * armazena o payment_id e invoice_url na tabela fiados.
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

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

function onlyDigits(v: string) { return (v || '').replace(/\D/g, '') }

const ASAAS_URL = 'https://api.asaas.com/v3'

async function asaasRequest(apiKey: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`${ASAAS_URL}${path}`, {
    method,
    headers: { 'access_token': apiKey, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.errors?.[0]?.description || JSON.stringify(data))
  return data
}

async function findOrCreateCustomer(apiKey: string, name: string, phone: string, cpf: string | null, externalRef: string) {
  const cpfClean = onlyDigits(cpf || '')
  const phoneClean = onlyDigits(phone || '')

  if (cpfClean.length === 11) {
    const found = await asaasRequest(apiKey, 'GET', `/customers?cpfCnpj=${cpfClean}&limit=1`).catch(() => null)
    if (found?.data?.length > 0) return found.data[0].id
  }

  if (externalRef) {
    const found = await asaasRequest(apiKey, 'GET', `/customers?externalReference=${externalRef}&limit=1`).catch(() => null)
    if (found?.data?.length > 0) {
      const c = found.data[0]
      if (cpfClean.length === 11 && !c.cpfCnpj) {
        await asaasRequest(apiKey, 'PUT', `/customers/${c.id}`, { cpfCnpj: cpfClean }).catch(() => null)
      }
      return c.id
    }
  }

  const payload: Record<string, string> = { name: name || 'Cliente', mobilePhone: phoneClean }
  if (cpfClean.length === 11) payload.cpfCnpj = cpfClean
  if (externalRef) payload.externalReference = externalRef

  const created = await asaasRequest(apiKey, 'POST', '/customers', payload)
  return created.id
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const body = await req.json()
    const { fiado_id, billing_type = 'PIX' } = body

    if (!fiado_id) return json({ error: 'fiado_id obrigatório' }, 400)

    const { data: settings } = await sb
      .from('store_settings')
      .select('asaas_api_key, company_name')
      .limit(1)
      .maybeSingle()

    const apiKey = settings?.asaas_api_key ?? ''
    if (!apiKey) return json({ error: 'API Key do Asaas não configurada. Vá em Configurações → Loja.' }, 400)

    const { data: fiado, error } = await sb
      .from('fiados')
      .select('*')
      .eq('id', fiado_id)
      .single()

    if (error || !fiado) return json({ error: 'Fiado não encontrado' }, 404)

    const balance = Math.max(
      (fiado.original_amount || 0) + (fiado.interest_accrued || 0) - (fiado.amount_paid || 0),
      0
    )
    if (balance <= 0) return json({ error: 'Fiado já quitado' }, 400)

    const customerId = await findOrCreateCustomer(
      apiKey,
      fiado.client_name,
      fiado.client_phone || '',
      fiado.client_cpf || null,
      `fiado-${fiado.id.slice(0, 8)}`
    )

    const todayStr = new Date().toISOString().split('T')[0]
    const dueDate = (fiado.due_date || '') > todayStr
      ? fiado.due_date
      : new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0]

    const charge = await asaasRequest(apiKey, 'POST', '/payments', {
      customer: customerId,
      billingType: billing_type,
      value: parseFloat(balance.toFixed(2)),
      dueDate,
      description: `Fiado ${fiado.client_name} - ${settings?.company_name || 'Loja'}`,
      externalReference: `fiado-${fiado.id}`,
      postalService: false,
      sendPaymentByPostalService: false,
    })

    await sb.from('fiados').update({
      asaas_payment_id: charge.id,
      asaas_payment_url: charge.invoiceUrl,
      updated_at: new Date().toISOString(),
    }).eq('id', fiado_id)

    return json({
      ok: true,
      charge_id: charge.id,
      invoice_url: charge.invoiceUrl,
      bank_slip_url: charge.bankSlipUrl || null,
      value: charge.value,
      due_date: charge.dueDate,
      status: charge.status,
      billing_type,
    })

  } catch (err) {
    console.error('fiado-asaas-cobranca error:', err)
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
