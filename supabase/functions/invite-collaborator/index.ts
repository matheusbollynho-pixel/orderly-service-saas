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
    // Quem convida é quem está logado (token), nunca um id vindo no corpo do pedido
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    const { data: auth } = token ? await supabase.auth.getUser(token) : { data: { user: null } }
    const caller = auth?.user
    if (!caller) return json({ error: 'Faça login de novo para convidar.' }, 401)

    const body = await req.json()
    const email = String(body.email ?? '').trim().toLowerCase()
    const { store_id, permissions } = body
    if (!email || !store_id) return json({ error: 'email e store_id obrigatórios' }, 400)

    // Só o dono da loja convida
    const { data: member } = await supabase
      .from('store_members')
      .select('role')
      .eq('user_id', caller.id)
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
      // Usuário já cadastrado — busca o ID pelo email (todas as páginas)
      let found: { id: string } | undefined
      for (let page = 1; page <= 20 && !found; page++) {
        const { data: lista } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
        const users = lista?.users ?? []
        found = users.find((u: { email?: string }) => (u.email ?? '').toLowerCase() === email)
        if (users.length < 1000) break
      }
      if (!found) throw inviteErr
      userId = found.id
    } else {
      userId = inviteData?.user?.id
    }

    // Verifica se já existe member para essa loja+email
    const { data: existing } = await supabase
      .from('store_members')
      .select('id, active, role')
      .eq('store_id', store_id)
      .eq('user_id', userId!)
      .maybeSingle()

    // Já foi colaborador e tinha sido removido: volta ativo
    if (existing && !existing.active && existing.role !== 'owner') {
      const { error: upErr } = await supabase.from('store_members')
        .update({ active: true, email, permissions: permissions || {} }).eq('id', existing.id)
      if (upErr) throw upErr
    }

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
