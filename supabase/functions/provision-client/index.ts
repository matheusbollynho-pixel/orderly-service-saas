import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const UAZAPI_BASE_URL = Deno.env.get('UAZAPI_BASE_URL') || 'https://bandara.uazapi.com'
const UAZAPI_INSTANCE_TOKEN = Deno.env.get('UAZAPI_INSTANCE_TOKEN') || ''
const DONO_PHONE = Deno.env.get('DONO_PHONE') || '75988388629'

async function notifyDono(msg: string) {
  if (!DONO_PHONE || !UAZAPI_INSTANCE_TOKEN) return
  try {
    await fetch(`${UAZAPI_BASE_URL}/send/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'token': UAZAPI_INSTANCE_TOKEN },
      body: JSON.stringify({ number: DONO_PHONE, text: msg }),
    })
  } catch { /* silencioso */ }
}

const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })

  try {
    const body = await req.json()
    const {
      company_name, store_phone, owner_name, owner_email, owner_password,
      plan = 'basic', is_trial = false, due_date, amount,
      whatsapp_instance_url, whatsapp_instance_token,
    } = body

    if (!company_name || !owner_email || !owner_password) {
      return new Response(JSON.stringify({ error: 'company_name, owner_email e owner_password são obrigatórios' }), { status: 400, headers: corsHeaders })
    }

    console.log('provision: iniciando para', owner_email, '| company:', company_name)

    // 1. Cria usuário via admin (sem afetar sessão atual)
    const { data: authData, error: authErr } = await sb.auth.admin.createUser({
      email: owner_email,
      password: owner_password,
      email_confirm: true,
    })
    if (authErr || !authData.user) {
      console.error('provision: erro auth', authErr?.message)
      return new Response(JSON.stringify({ error: authErr?.message ?? 'Erro ao criar usuário' }), { status: 400, headers: corsHeaders })
    }
    const userId = authData.user.id
    console.log('provision: usuário criado', userId)

    // 2. Cria store_settings
    const trialEndsAt = is_trial ? new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString() : null
    const { data: store, error: storeErr } = await sb
      .from('store_settings')
      .insert({
        company_name,
        store_phone: store_phone || null,
        plan: is_trial ? 'trial' : plan,
        active: true,
        trial_ends_at: trialEndsAt,
        whatsapp_instance_url: whatsapp_instance_url || null,
        whatsapp_instance_token: whatsapp_instance_token || null,
        onboarded: false,
      })
      .select('id')
      .single()

    if (storeErr || !store) {
      console.error('provision: erro store_settings', storeErr?.message)
      await sb.auth.admin.deleteUser(userId)
      return new Response(JSON.stringify({ error: storeErr?.message ?? 'Erro ao criar loja' }), { status: 400, headers: corsHeaders })
    }
    console.log('provision: store criada', store.id)

    // 3. Cria store_members
    const { error: memberErr } = await sb
      .from('store_members')
      .insert({ store_id: store.id, user_id: userId, role: 'owner', active: true })

    if (memberErr) {
      console.error('provision: erro store_members', memberErr.message)
      await sb.auth.admin.deleteUser(userId)
      await sb.from('store_settings').delete().eq('id', store.id)
      return new Response(JSON.stringify({ error: memberErr.message }), { status: 400, headers: corsHeaders })
    }
    console.log('provision: member criado')

    // 4. Cria saas_subscription
    // Para trial: salva o plano recomendado (não 'trial') para saber o que cobrar depois
    await sb.from('saas_subscriptions').insert({
      store_id: store.id,
      owner_name: owner_name || company_name,
      owner_email,
      owner_phone: store_phone || null,
      company_name,
      plan: is_trial ? (plan || 'basic') : plan,
      status: is_trial ? 'pending' : 'active',
      due_date: is_trial ? trialEndsAt?.split('T')[0] : (due_date || null),
      amount: amount ? parseFloat(amount) : null,
    })

    // Notifica dono
    const planLabel: Record<string, string> = { basic: 'Básico', pro: 'Profissional', premium: 'Premium', trial: 'Trial' }
    await notifyDono(`🆕 *Nova conta criada!*\n\n🏪 ${company_name}\n📧 ${owner_email}\n📱 ${store_phone || '—'}\n💼 Plano: ${planLabel[is_trial ? 'trial' : plan] || plan}\n\n⚙️ Configure o WhatsApp e IA para este cliente.`)

    return new Response(JSON.stringify({ success: true, store_id: store.id, user_id: userId, trial_ends_at: trialEndsAt }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders })
  }
})
