// Conexão self-service do WhatsApp (UazAPI) da loja.
// Loja Profissional/Premium ativa (já pagou — trial não) toca em "Conectar":
// se ainda não tem instância, a função cria uma na conta UazAPI da plataforma
// (admin token só existe aqui no servidor) e devolve o QR. Se a instância foi
// cadastrada à mão no SuperAdmin, só reconecta. O token nunca vai pro navegador.
// A limpeza das automáticas de quem deixou de pagar fica no check-overdue-subscriptions.
//
// Body: { acao: "status" | "conectar" | "desconectar" }
// Resposta: { ok, status: "sem_instancia"|"desconectado"|"conectando"|"conectado", qrcode?, numero?, perfil?, bloqueio?, error? }

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

const UAZAPI_ADMIN_URL = (Deno.env.get('UAZAPI_URL') || Deno.env.get('UAZAPI_BASE_URL') || '').replace(/\/$/, '')
const UAZAPI_ADMIN_TOKEN = Deno.env.get('UAZAPI_ADMIN_TOKEN') || ''
const PLANOS_COM_WHATSAPP = ['pro', 'premium', 'enterprise']

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

async function uazapi(base: string, path: string, token: string, method: 'GET' | 'POST' | 'DELETE', body?: unknown, admintoken?: string) {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers.token = token
    if (admintoken) headers.admintoken = admintoken
    const res = await fetch(`${base}${path}`, {
      method,
      headers,
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
    .select('id, plan, active, custom_features, whatsapp_instance_url, whatsapp_instance_token, whatsapp_provider')
    .eq('id', member.store_id)
    .single()
  if (!loja) return json({ ok: false, error: 'Loja não encontrada' }, 404)

  // Pode GANHAR instância nova? Plano com WhatsApp + loja ativa (pagamento em dia).
  // Trial não: cada número ocupa vaga paga na UazAPI.
  const custom = Array.isArray(loja.custom_features) ? loja.custom_features as string[] : null
  const planoTemWhatsapp = custom ? custom.includes('pos-venda') : PLANOS_COM_WHATSAPP.includes(loja.plan)
  const bloqueio = !loja.active ? 'inativo' : loja.plan === 'trial' ? 'trial' : !planoTemWhatsapp ? 'plano' : undefined

  let base = (loja.whatsapp_instance_url ?? '').replace(/\/$/, '')
  let token = loja.whatsapp_instance_token ?? ''
  const provider = (loja.whatsapp_provider || 'uazapi').toLowerCase()
  if (provider !== 'uazapi' && base && token) return json({ ok: true, status: 'sem_instancia', bloqueio })
  const temInstancia = !!(base && token)

  if (acao === 'status') {
    if (!temInstancia) return json({ ok: true, status: 'sem_instancia', bloqueio })
    return json({ ok: true, ...(await lerStatus(base, token)) })
  }

  // Desconectar só desliga o número: a instância continua salva na loja e é
  // reaproveitada no próximo "Conectar" (mesmo número ou outro) — nunca cria outra.
  if (acao === 'desconectar') {
    if (!temInstancia) return json({ ok: true, status: 'sem_instancia', bloqueio })
    await uazapi(base, '/instance/disconnect', token, 'POST')
    return json({ ok: true, status: 'desconectado' })
  }

  // conectar
  if (!temInstancia) {
    if (bloqueio === 'trial') return json({ ok: false, bloqueio, error: 'O WhatsApp é liberado depois do primeiro pagamento do plano Profissional.' }, 402)
    if (bloqueio === 'plano') return json({ ok: false, bloqueio, error: 'WhatsApp automático é do plano Profissional.' }, 402)
    if (bloqueio === 'inativo') return json({ ok: false, bloqueio, error: 'Assinatura vencida. Regularize pra usar o WhatsApp.' }, 402)
    if (!UAZAPI_ADMIN_URL || !UAZAPI_ADMIN_TOKEN) return json({ ok: false, error: 'WhatsApp ainda não configurado na plataforma. Fale com o suporte do SpeedSeek.' }, 503)

    const corpo = { name: `speedseek-${loja.id.slice(0, 8)}`, systemName: 'speedseekos', adminField01: loja.id }
    // v2.4+ é /instance/create; servidores mais antigos usam /instance/init
    let r = await uazapi(UAZAPI_ADMIN_URL, '/instance/create', '', 'POST', corpo, UAZAPI_ADMIN_TOKEN)
    if (!r.ok && (r.status === 404 || r.status === 405)) {
      r = await uazapi(UAZAPI_ADMIN_URL, '/instance/init', '', 'POST', corpo, UAZAPI_ADMIN_TOKEN)
    }
    const novoToken = r.data?.token ?? r.data?.instance?.token
    if (!r.ok || !novoToken) {
      const msg = r.status === 429
        ? 'Sem vaga de número no servidor de WhatsApp agora. Fale com o suporte do SpeedSeek.'
        : `Falha ao criar a conexão (${r.erro ?? 'sem token'}). Tente de novo em instantes.`
      return json({ ok: false, error: msg }, 502)
    }
    // Só grava se a loja AINDA não tem instância (dois cliques/abas ao mesmo
    // tempo não podem deixar 2 instâncias ocupando vaga). Perdeu a corrida =
    // apaga a recém-criada e usa a que já ficou salva.
    const { data: gravou, error } = await supabaseAdmin
      .from('store_settings')
      .update({ whatsapp_instance_url: UAZAPI_ADMIN_URL, whatsapp_instance_token: novoToken, whatsapp_provider: 'uazapi', whatsapp_instance_auto: true })
      .eq('id', loja.id)
      .is('whatsapp_instance_token', null)
      .select('id')
    if (error || !gravou?.length) {
      await uazapi(UAZAPI_ADMIN_URL, '/instance', novoToken, 'DELETE', undefined, UAZAPI_ADMIN_TOKEN)
      if (error) return json({ ok: false, error: error.message }, 500)
      const { data: atualLoja } = await supabaseAdmin
        .from('store_settings')
        .select('whatsapp_instance_url, whatsapp_instance_token')
        .eq('id', loja.id)
        .single()
      base = (atualLoja?.whatsapp_instance_url ?? '').replace(/\/$/, '')
      token = atualLoja?.whatsapp_instance_token ?? ''
      if (!base || !token) return json({ ok: false, error: 'Tente de novo em instantes.' }, 409)
    } else {
      base = UAZAPI_ADMIN_URL
      token = novoToken
    }
  }

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
