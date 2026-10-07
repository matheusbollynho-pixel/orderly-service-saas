// Reconexão self-service do WhatsApp (UazAPI) da loja.
// A instância continua sendo cadastrada pelo SuperAdmin (url+token em
// store_settings); aqui o dono só vê o status e lê o QR quando o número cai,
// sem precisar chamar o suporte. O token da instância nunca vai pro navegador.
//
// Body: { acao: "status" | "conectar" | "desconectar" }
// Resposta: { ok, status: "sem_instancia"|"desconectado"|"conectando"|"conectado", qrcode?, numero?, perfil?, error? }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
  'Content-Type': 'application/json',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS_HEADERS })
}

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

async function uazapi(base: string, path: string, token: string, method: 'GET' | 'POST', body?: unknown) {
  try {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { token, 'Content-Type': 'application/json' },
      body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
    })
    const raw = await res.text()
    let data: any = {}
    try { data = JSON.parse(raw) } catch { /* resposta não-JSON */ }
    return { ok: res.ok, status: res.status, data, erro: res.ok ? undefined : `${res.status} ${raw.slice(0, 200)}` }
  } catch (e) {
    return { ok: false, status: 0, data: {}, erro: String(e) }
  }
}

async function lerStatus(base: string, token: string) {
  const r = await uazapi(base, '/instance/status', token, 'GET')
  if (!r.ok) return { status: 'desconectado' as const }
  const inst = r.data?.instance ?? {}
  const st = typeof inst.status === 'string' ? inst.status : typeof r.data?.status === 'string' ? r.data.status : ''
  const conectado = r.data?.status?.connected === true || st === 'connected' || st === 'open'
  return {
    status: conectado ? ('conectado' as const) : st === 'connecting' ? ('conectando' as const) : ('desconectado' as const),
    qrcode: conectado ? undefined : (inst.qrcode || r.data?.qrcode || undefined),
    numero: inst.owner || r.data?.status?.jid?.split?.('@')[0] || undefined,
    perfil: inst.profileName || undefined,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405)

  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
  if (!jwt) return json({ ok: false, error: 'Sem autenticação' }, 401)
  const { data: userData } = await supabaseAdmin.auth.getUser(jwt)
  if (!userData?.user) return json({ ok: false, error: 'Sessão inválida' }, 401)

  const { acao } = await req.json().catch(() => ({}))
  if (!['status', 'conectar', 'desconectar'].includes(acao)) return json({ ok: false, error: 'acao inválida' }, 400)

  const { data: member } = await supabaseAdmin
    .from('store_members')
    .select('store_id, role')
    .eq('user_id', userData.user.id)
    .eq('active', true)
    .maybeSingle()
  if (!member?.store_id) return json({ ok: false, error: 'Usuário sem loja' }, 403)
  if (member.role !== 'owner') return json({ ok: false, error: 'Só o dono da loja pode conectar o WhatsApp' }, 403)

  const { data: loja } = await supabaseAdmin
    .from('store_settings')
    .select('whatsapp_instance_url, whatsapp_instance_token, whatsapp_provider')
    .eq('id', member.store_id)
    .single()

  const base = (loja?.whatsapp_instance_url ?? '').replace(/\/$/, '')
  const token = loja?.whatsapp_instance_token ?? ''
  const provider = (loja?.whatsapp_provider || 'uazapi').toLowerCase()
  if (!base || !token || provider !== 'uazapi') return json({ ok: true, status: 'sem_instancia' })

  if (acao === 'status') return json({ ok: true, ...(await lerStatus(base, token)) })

  if (acao === 'desconectar') {
    await uazapi(base, '/instance/disconnect', token, 'POST')
    return json({ ok: true, status: 'desconectado' })
  }

  // conectar
  const atual = await lerStatus(base, token)
  if (atual.status === 'conectado') return json({ ok: true, ...atual })
  const c = await uazapi(base, '/instance/connect', token, 'POST', {})
  if (!c.ok) {
    const msg = c.status === 429
      ? 'Servidor de WhatsApp lotado no momento. Fale com o suporte do SpeedSeek.'
      : `Falha ao gerar QR Code (${c.erro}). Tente de novo em alguns segundos.`
    return json({ ok: false, error: msg }, 502)
  }
  const st = await lerStatus(base, token)
  return json({ ok: true, ...st, qrcode: st.qrcode ?? c.data?.instance?.qrcode ?? c.data?.qrcode })
})
