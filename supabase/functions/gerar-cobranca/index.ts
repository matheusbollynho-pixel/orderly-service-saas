import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const ASAAS_API_KEY = Deno.env.get('ASAAS_API_KEY')!
const ASAAS_API_URL = 'https://api.asaas.com/v3'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function nextDueDate(): string {
  const now = new Date()
  const year = now.getDate() < 10 ? now.getFullYear() : (now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear())
  const month = now.getDate() < 10 ? now.getMonth() : (now.getMonth() === 11 ? 0 : now.getMonth() + 1)
  return `${year}-${String(month + 1).padStart(2, '0')}-10`
}

const PLAN_LABELS: Record<string, string> = {
  basic: 'Básico',
  pro: 'Profissional',
  premium: 'Premium',
  enterprise: 'Enterprise',
}

const PLAN_VALUES: Record<string, number> = {
  basic: 79,
  pro: 149,
  premium: 219,
  enterprise: 349,
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json({ error: 'JSON inválido' }, 400) }

  const store_id = body.store_id as string
  if (!store_id) return json({ error: 'store_id obrigatório' }, 400)

  // Plano alvo: se veio 'plan' no body é upgrade, senão renova o plano atual
  const targetPlan = body.plan as string | undefined

  // Busca dados da loja e assinatura
  const { data: store } = await sb
    .from('store_settings')
    .select('id, company_name, owner_email, asaas_customer_id, plan')
    .eq('id', store_id)
    .maybeSingle()

  if (!store) return json({ error: 'Loja não encontrada' }, 404)

  // Busca assinatura mais recente
  const { data: sub } = await sb
    .from('saas_subscriptions')
    .select('asaas_customer_id, amount, plan')
    .eq('store_id', store_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const asaasCustomerId = store.asaas_customer_id || sub?.asaas_customer_id
  if (!asaasCustomerId) return json({ error: 'Cliente não encontrado no Asaas. Entre em contato com o suporte.' }, 400)

  const plan = targetPlan || sub?.plan || store.plan || 'basic'
  // Upgrade usa o valor fixo do plano; renovação usa o valor da assinatura (pode ter desconto)
  const amount = targetPlan ? (PLAN_VALUES[plan] || 79) : (sub?.amount || PLAN_VALUES[plan] || 79)
  const dueDate = nextDueDate()
  const isUpgrade = targetPlan && targetPlan !== (sub?.plan || store.plan)
  const description = isUpgrade
    ? `Upgrade SpeedSeek OS → Plano ${PLAN_LABELS[plan] || plan} | ${store.company_name || store.owner_email}`
    : `Mensalidade SpeedSeek OS — Plano ${PLAN_LABELS[plan] || plan} | ${store.company_name || store.owner_email}`

  // externalReference inclui plano E store_id para o webhook identificar tudo
  const externalReference = `speedseek_${plan}_${store_id}`

  // Cria cobrança PIX no Asaas
  const createRes = await fetch(`${ASAAS_API_URL}/payments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'access_token': ASAAS_API_KEY,
    },
    body: JSON.stringify({
      customer: asaasCustomerId,
      billingType: 'PIX',
      value: amount,
      dueDate,
      description,
      externalReference,
    }),
  })

  const payment = await createRes.json()
  console.log('Asaas create payment:', createRes.status, payment?.id, payment?.error)

  if (!createRes.ok || payment.error) {
    const errMsg = payment?.errors?.[0]?.description || payment?.error || 'Erro ao criar cobrança no Asaas'
    return json({ error: errMsg }, 400)
  }

  const paymentId = payment.id

  // Busca QR Code PIX
  const pixRes = await fetch(`${ASAAS_API_URL}/payments/${paymentId}/pixQrCode`, {
    headers: { 'access_token': ASAAS_API_KEY },
  })
  const pix = await pixRes.json()
  console.log('Asaas PIX QR:', pixRes.status, pix?.success)

  return json({
    success: true,
    payment_id: paymentId,
    invoice_url: payment.invoiceUrl,
    pix_code: pix?.payload || null,
    pix_image: pix?.encodedImage || null,
    amount,
    due_date: dueDate,
    plan,
    plan_label: PLAN_LABELS[plan] || plan,
    is_upgrade: !!isUpgrade,
  })
})
