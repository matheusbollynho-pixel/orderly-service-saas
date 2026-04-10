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
    // Verifica autenticação do chamador
    const authHeader = req.headers.get('authorization') || ''
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

    const { email, store_id, permissions } = await req.json()
    if (!email || !store_id) return json({ error: 'email e store_id obrigatórios' }, 400)

    // Verifica se o chamador é owner da loja
    const { data: member } = await supabase
      .from('store_members')
      .select('role')
      .eq('user_id', user.id)
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
    const appUrl = 'https://speedseekos-demo.vercel.app/'

    // Envia convite via Supabase Auth
    const { data: inviteData, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: { store_id, permissions, company_name: store?.company_name },
      redirectTo: appUrl,
    })

    if (inviteErr) throw inviteErr

    const userId = inviteData?.user?.id

    // Verifica se já existe member para essa loja+email
    const { data: existing } = await supabase
      .from('store_members')
      .select('id')
      .eq('store_id', store_id)
      .eq('user_id', userId!)
      .maybeSingle()

    if (!existing && userId) {
      await supabase.from('store_members').insert({
        store_id,
        user_id: userId,
        role: 'collaborator',
        active: true,
        email,
        permissions: permissions || {},
      })
    }

    return json({ ok: true, email })
  } catch (e) {
    console.error(e)
    return json({ error: (e as Error).message }, 500)
  }
})
