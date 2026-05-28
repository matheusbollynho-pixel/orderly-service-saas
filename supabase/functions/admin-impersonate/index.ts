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
    // Verifica que quem chamou é super admin
    const authHeader = req.headers.get('Authorization') || ''
    const callerToken = authHeader.replace('Bearer ', '')
    const { data: { user: caller }, error: callerErr } = await supabase.auth.getUser(callerToken)
    if (callerErr || !caller) return json({ error: 'Não autorizado' }, 401)

    const { data: callerMeta } = await supabase
      .from('store_settings')
      .select('id')
      .eq('id', '00000000-0000-0000-0000-000000000000') // placeholder
      .limit(1)

    // Verifica se o caller é super admin pelo metadata
    const isSuperAdmin = caller.user_metadata?.role === 'super_admin' || caller.email === Deno.env.get('SUPER_ADMIN_EMAIL')
    if (!isSuperAdmin) return json({ error: 'Acesso negado — apenas super admin' }, 403)

    const { email } = await req.json()
    if (!email) return json({ error: 'email obrigatório' }, 400)

    // Gera magic link sem enviar email ao usuário
    const { data, error } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { shouldCreateUser: false },
    })

    if (error || !data?.properties?.action_link) {
      return json({ error: error?.message || 'Não foi possível gerar o link' }, 400)
    }

    return json({ link: data.properties.action_link })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
