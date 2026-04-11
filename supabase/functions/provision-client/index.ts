import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

    // 1. Cria usuário via admin (sem afetar sessão atual)
    const { data: authData, error: authErr } = await sb.auth.admin.createUser({
      email: owner_email,
      password: owner_password,
      email_confirm: true,
    })
    if (authErr || !authData.user) {
      return new Response(JSON.stringify({ error: authErr?.message ?? 'Erro ao criar usuário' }), { status: 400, headers: corsHeaders })
    }
    const userId = authData.user.id

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
      await sb.auth.admin.deleteUser(userId)
      return new Response(JSON.stringify({ error: storeErr?.message ?? 'Erro ao criar loja' }), { status: 400, headers: corsHeaders })
    }

    // 3. Cria store_members
    const { error: memberErr } = await sb
      .from('store_members')
      .insert({ store_id: store.id, user_id: userId, role: 'owner', active: true })

    if (memberErr) {
      await sb.auth.admin.deleteUser(userId)
      await sb.from('store_settings').delete().eq('id', store.id)
      return new Response(JSON.stringify({ error: memberErr.message }), { status: 400, headers: corsHeaders })
    }

    // 4. Cria saas_subscription
    await sb.from('saas_subscriptions').insert({
      store_id: store.id,
      owner_name: owner_name || company_name,
      owner_email,
      owner_phone: store_phone || null,
      company_name,
      plan: is_trial ? 'trial' : plan,
      status: is_trial ? 'pending' : 'active',
      due_date: is_trial ? trialEndsAt?.split('T')[0] : (due_date || null),
      amount: amount ? parseFloat(amount) : null,
    })

    return new Response(JSON.stringify({ success: true, store_id: store.id, user_id: userId, trial_ends_at: trialEndsAt }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders })
  }
})
