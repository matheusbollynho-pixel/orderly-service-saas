// Página pública do link de cotação (o representante abre sem login).
// verify_jwt = false: a "senha" é o token de 64 caracteres aleatórios do link.
//
// GET  ?token=...  -> loja, representante, peças do link e o que ele já respondeu
// POST { token, itens: [{ item_id, opcao, preco?, marca?, obs? }], prazo?, obs? }
//      opcao: 'tenho' | 'nao_tenho' | 'nao_trabalho'
//
// Nunca expõe preço de outro representante nem dado de outra loja.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
  'Content-Type': 'application/json',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS_HEADERS })
}

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const TOKEN_RE = /^[0-9a-f]{64}$/
const MAX_ENVIOS = 30 // por link (evita abuso: o rep corrige algumas vezes, não infinitas)

type Opcao = 'tenho' | 'nao_tenho' | 'nao_trabalho'

async function carregarLink(token: string) {
  if (!TOKEN_RE.test(token)) return null
  const { data } = await supabaseAdmin
    .from('cotacao_links')
    .select('id, store_id, representante_id, itens, expira_em, resposta_id, respondido_em, envios')
    .eq('token', token)
    .maybeSingle()
  return data
}

const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS })

  try {
    if (req.method === 'GET') {
      const token = new URL(req.url).searchParams.get('token') ?? ''
      const link = await carregarLink(token)
      if (!link) return json({ error: 'Link inválido.' }, 404)
      const vencido = new Date(link.expira_em).getTime() < Date.now()

      const [{ data: loja }, { data: rep }, { data: itens }] = await Promise.all([
        supabaseAdmin.from('store_settings').select('company_name').eq('id', link.store_id).maybeSingle(),
        supabaseAdmin.from('representantes').select('nome').eq('id', link.representante_id).maybeSingle(),
        supabaseAdmin.from('cotacao_itens').select('id, texto, quantidade').in('id', link.itens).eq('store_id', link.store_id),
      ])

      let respostas: unknown[] = []
      let prazo: string | null = null
      if (link.resposta_id) {
        const [{ data: precos }, { data: resp }] = await Promise.all([
          supabaseAdmin.from('cotacao_precos')
            .select('item_id, situacao, preco, marca, motivo')
            .eq('resposta_id', link.resposta_id),
          supabaseAdmin.from('cotacao_respostas').select('prazo_entrega').eq('id', link.resposta_id).maybeSingle(),
        ])
        respostas = precos ?? []
        prazo = resp?.prazo_entrega ?? null
      }

      // Mantém a ordem em que as peças foram enviadas
      const ordem = new Map<string, number>((link.itens as string[]).map((id, i) => [id, i]))
      const lista = (itens ?? []).sort((a, b) => (ordem.get(a.id) ?? 0) - (ordem.get(b.id) ?? 0))

      return json({
        loja: loja?.company_name ?? 'Loja',
        representante: rep?.nome ?? '',
        itens: lista,
        respostas,
        prazo,
        respondido_em: link.respondido_em,
        expira_em: link.expira_em,
        vencido,
      })
    }

    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return json({ error: 'JSON inválido' }, 400)
    }

    const link = await carregarLink(texto(body.token, 100))
    if (!link) return json({ error: 'Link inválido.' }, 404)
    if (new Date(link.expira_em).getTime() < Date.now()) return json({ error: 'Esse link venceu. Peça um novo pra loja.' }, 410)
    if (link.envios >= MAX_ENVIOS) return json({ error: 'Limite de envios desse link atingido. Fale com a loja.' }, 429)

    const permitidos = new Set<string>(link.itens)
    const entrada = Array.isArray(body.itens) ? body.itens.slice(0, 300) : []
    const linhas: Record<string, unknown>[] = []
    for (const raw of entrada) {
      const r = raw as Record<string, unknown>
      const itemId = texto(r.item_id, 40)
      const opcao = r.opcao as Opcao
      if (!permitidos.has(itemId) || !['tenho', 'nao_tenho', 'nao_trabalho'].includes(opcao)) continue
      const obs = texto(r.obs, 300)
      const marca = texto(r.marca, 80)
      if (opcao === 'tenho') {
        const preco = Number(r.preco)
        if (!Number.isFinite(preco) || preco <= 0 || preco > 1_000_000) {
          return json({ error: 'Coloque o valor das peças marcadas como "Tenho".' }, 400)
        }
        linhas.push({ item_id: itemId, situacao: 'cotado', preco: Math.round(preco * 100) / 100, marca: marca || null, motivo: obs || null, preco_por: 'unidade', confirmado: true })
      } else {
        const base = opcao === 'nao_tenho' ? 'Não tem no momento' : 'Não trabalha com essa peça'
        linhas.push({ item_id: itemId, situacao: 'nao_tem', preco: null, marca: null, motivo: obs ? `${base}: ${obs}` : base, preco_por: 'nao_informado', confirmado: true })
      }
    }
    if (linhas.length === 0) return json({ error: 'Responda pelo menos uma peça.' }, 400)

    // As peças precisam continuar existindo e ser da loja do link
    const { data: vivos } = await supabaseAdmin
      .from('cotacao_itens').select('id').in('id', linhas.map((l) => l.item_id as string)).eq('store_id', link.store_id)
    const existe = new Set((vivos ?? []).map((v) => v.id))
    const validas = linhas.filter((l) => existe.has(l.item_id as string))
    if (validas.length === 0) return json({ error: 'Essas peças não estão mais na cotação.' }, 409)

    const prazo = texto(body.prazo, 200) || null
    const obsGeral = texto(body.obs, 500) || null

    // Cria (ou reaproveita) a "resposta" do link
    let respostaId = link.resposta_id as string | null
    if (respostaId) {
      await supabaseAdmin.from('cotacao_respostas')
        .update({ prazo_entrega: prazo, condicao_frete: obsGeral, texto: obsGeral })
        .eq('id', respostaId)
      await supabaseAdmin.from('cotacao_precos').delete().eq('resposta_id', respostaId)
    } else {
      const { data: resp, error } = await supabaseAdmin.from('cotacao_respostas')
        .insert({ store_id: link.store_id, representante_id: link.representante_id, texto: obsGeral, prazo_entrega: prazo, condicao_frete: obsGeral, modelo: 'link' })
        .select('id').single()
      if (error || !resp) return json({ error: 'Erro ao salvar.' }, 500)
      respostaId = resp.id
    }

    // Resposta nova substitui preços antigos desse representante pras mesmas
    // peças (menos o que a loja já escolheu pra pedido)
    const itensIds = validas.map((l) => l.item_id as string)
    const { data: escolhidos } = await supabaseAdmin
      .from('cotacao_itens').select('pedido_preco_id').eq('store_id', link.store_id).not('pedido_preco_id', 'is', null)
    const protegidos = (escolhidos ?? []).map((e) => e.pedido_preco_id as string)
    let del = supabaseAdmin.from('cotacao_precos').delete()
      .eq('store_id', link.store_id).eq('representante_id', link.representante_id)
      .in('item_id', itensIds).neq('resposta_id', respostaId)
    if (protegidos.length) del = del.not('id', 'in', `(${protegidos.join(',')})`)
    await del

    const { error: insErr } = await supabaseAdmin.from('cotacao_precos').insert(validas.map((l) => ({
      ...l,
      store_id: link.store_id,
      resposta_id: respostaId,
      representante_id: link.representante_id,
      fonte: 'representante',
      texto_original: null,
    })))
    if (insErr) {
      console.error('cotacao-link insert', insErr)
      return json({ error: 'Erro ao salvar os preços.' }, 500)
    }

    await supabaseAdmin.from('cotacao_links')
      .update({ resposta_id: respostaId, respondido_em: new Date().toISOString(), envios: link.envios + 1 })
      .eq('id', link.id)

    return json({ ok: true, salvas: validas.length })
  } catch (e) {
    console.error('cotacao-link erro', e)
    return json({ error: 'Erro interno' }, 500)
  }
})
