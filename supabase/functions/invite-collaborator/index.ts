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
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { email, store_id, permissions, owner_user_id } = await req.json()
    if (!email || !store_id || !owner_user_id) return json({ error: 'email, store_id e owner_user_id obrigatórios' }, 400)

    // Verifica se o owner_user_id é realmente owner da loja (via service role)
    const { data: member } = await supabase
      .from('store_members')
      .select('role')
      .eq('user_id', owner_user_id)
      .eq('store_id', store_id)
      .eq('active', true)
      .maybeSingle()

    if (member?.role !== 'owner') return json({ error: 'Apenas o proprietário pode convidar' }, 403)

    // Busca nome da loja para o redirect
    const { data: store } = await supabase
      .from('store_settings')
      .select('company_name')
      .eq('id', store_id)
      .maybeSingle()

    const redirectTo = `${Deno.env.get('SUPABASE_URL')?.replace('supabase.co', 'supabase.co') || ''}`
    const appUrl = 'https://app.speedseekos.com.br/'

    // Tenta enviar convite; se usuário já existe, busca pelo email
    let userId: string | undefined
    const { data: inviteData, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: { store_id, permissions, company_name: store?.company_name },
      redirectTo: appUrl,
    })

    if (inviteErr) {
      // Usuário já cadastrado — busca o ID pelo email
      const { data: existingUser } = await supabase.auth.admin.listUsers()
      const found = existingUser?.users?.find((u: { email?: string }) => u.email === email)
      if (!found) throw inviteErr
      userId = found.id
    } else {
      userId = inviteData?.user?.id
    }

    // Verifica se já existe member para essa loja+email
    const { data: existing } = await supabase
      .from('store_members')
      .select('id')
      .eq('store_id', store_id)
      .eq('user_id', userId!)
      .maybeSingle()

    if (!existing && userId) {
      const { error: insertErr } = await supabase.from('store_members').insert({
        store_id,
        user_id: userId,
        role: 'admin',
        active: true,
        email,
        permissions: permissions || {},
      })
      if (insertErr) throw insertErr
    }

    return json({ ok: true, email })
  } catch (e) {
    console.error(e)
    return json({ error: (e as Error).message }, 500)
  }
})
