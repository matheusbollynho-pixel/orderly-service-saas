// Lê a resposta de um representante (texto colado, foto ou PDF), liga cada
// preço a um item da lista de faltas da loja e grava as opções em cotacao_precos.
//
// POST { representante_id?: string, texto?: string,
//        arquivo?: { nome: string, tipo: string, base64: string } }
// Exige usuário logado (verify_jwt padrão). A loja vem do token, nunca do body.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Anthropic from 'npm:@anthropic-ai/sdk@1.8.0'
import { zodOutputFormat } from 'npm:@anthropic-ai/sdk@1.8.0/helpers/zod'
import { z } from 'npm:zod@4.6.7'
import { logAiUsage, checkAiBudget } from '../_shared/aiUsage.ts'

const MODELO = 'claude-haiku-5-5'
const MAX_TEXTO = 20_000
const MAX_ARQUIVO_B64 = 9_500_000 // ~7 MB
const TIPOS_IMAGEM = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const

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
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

async function resolveStoreId(req: Request): Promise<string | null> {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const { data: userData } = await supabaseAdmin.auth.getUser(token)
  if (!userData?.user) return null
  const { data: member } = await supabaseAdmin
    .from('store_members')
    .select('store_id')
    .eq('user_id', userData.user.id)
    .eq('active', true)
    .maybeSingle()
  return member?.store_id ?? null
}

const LinhaSchema = z.object({
  texto_original: z.string(),
  item_numero: z.number().int().nullable(),
  situacao: z.enum(['cotado', 'nao_tem', 'duvida', 'nao_serve']),
  marca: z.string().nullable(),
  preco: z.number().nullable(),
  preco_por: z.enum(['unidade', 'par', 'kit', 'nao_informado']),
  motivo: z.string(),
})

const RespostaSchema = z.object({
  linhas: z.array(LinhaSchema),
  prazo_entrega: z.string().nullable(),
  condicao_frete: z.string().nullable(),
})

const SYSTEM = `Você ajuda uma loja de peças de moto a organizar cotações recebidas de representantes pelo WhatsApp.

Você recebe a LISTA DE FALTAS da loja (numerada, escrita no jeito da loja), o DICIONÁRIO de gírias da loja e a RESPOSTA de um representante (texto, foto ou PDF).
Para cada peça mencionada na resposta, diga a qual número da lista ela corresponde (item_numero), ou null se não corresponde a nenhum.

Regras:
- Ignore acentos, maiúsculas e abreviações comuns: "camara" = "câmara", "relacao" = "relação", "acel" = "acelerador", "escap" = "escapamento". Isso vale pra lista, pro dicionário e pra resposta.
- Errar a peça custa caro (peça errada chega e tem que devolver). Na dúvida, marque "duvida" e explique. Nunca chute.
- Se a peça é parecida mas diferente da pedida (outro lado, outro cabo, só parte do kit, ponteira em vez de escape), marque "nao_serve".
- Se a medida/modelo não está no dicionário e não dá pra ter certeza, marque "duvida".
- Um mesmo item pode ter várias opções de marca; cada opção é uma linha.
- Se o representante disse que não tem, marque "nao_tem".
- preco é o valor em reais como número (89,90 -> 89.9). Se não tiver preço, null.
- motivo é lido pelo dono da loja: português simples, uma frase.
- Ignore saudações e textos que não são peça. Prazo e frete vão em prazo_entrega e condicao_frete.`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
  if (!ANTHROPIC_API_KEY) return json({ error: 'ANTHROPIC_API_KEY não configurada' }, 500)

  const storeId = await resolveStoreId(req)
  if (!storeId) return json({ error: 'Não autorizado' }, 401)

  let representanteId: string | null = null
  let texto = ''
  let arquivo: { nome: string; tipo: string; base64: string } | null = null
  try {
    const body = await req.json()
    representanteId = typeof body.representante_id === 'string' && body.representante_id ? body.representante_id : null
    texto = typeof body.texto === 'string' ? body.texto.trim() : ''
    if (body.arquivo && typeof body.arquivo.base64 === 'string') {
      arquivo = {
        nome: String(body.arquivo.nome ?? 'arquivo').slice(0, 200),
        tipo: String(body.arquivo.tipo ?? ''),
        base64: body.arquivo.base64,
      }
    }
  } catch {
    return json({ error: 'JSON inválido' }, 400)
  }

  if (!texto && !arquivo) return json({ error: 'Cole o texto da resposta ou anexe a foto/PDF.' }, 400)
  if (texto.length > MAX_TEXTO) return json({ error: 'Texto muito grande.' }, 400)
  if (arquivo) {
    if (arquivo.base64.length > MAX_ARQUIVO_B64) return json({ error: 'Arquivo muito grande (máx. 7 MB).' }, 400)
    const ok = arquivo.tipo === 'application/pdf' || (TIPOS_IMAGEM as readonly string[]).includes(arquivo.tipo)
    if (!ok) return json({ error: 'Formato não aceito. Use foto (JPG/PNG) ou PDF.' }, 400)
  }

  let representanteNome = 'sem nome'
  if (representanteId) {
    const { data: rep } = await supabaseAdmin
      .from('representantes')
      .select('id, nome')
      .eq('id', representanteId)
      .eq('store_id', storeId)
      .maybeSingle()
    if (!rep) return json({ error: 'Representante não encontrado.' }, 404)
    representanteNome = rep.nome
  }

  const { data: itens, error: itensErr } = await supabaseAdmin
    .from('cotacao_itens')
    .select('id, texto, quantidade')
    .eq('store_id', storeId)
    .eq('status', 'pendente')
    .order('created_at', { ascending: true })
    .limit(400)
  if (itensErr) return json({ error: 'Erro ao carregar a lista de faltas.' }, 500)
  if (!itens || itens.length === 0) return json({ error: 'A lista de faltas está vazia.' }, 400)

  const { data: regras } = await supabaseAdmin
    .from('cotacao_dicionario')
    .select('regra')
    .eq('store_id', storeId)
    .order('created_at', { ascending: true })
    .limit(500)

  const budget = await checkAiBudget(supabaseAdmin, storeId)
  if (!budget.allowed) {
    return json({ error: `Limite de IA do plano atingido este mês (R$ ${budget.spentBrl.toFixed(2)} de R$ ${budget.budgetBrl.toFixed(2)}).` }, 402)
  }

  const listaTxt = itens.map((i, idx) => `${idx + 1}. ${i.texto}${Number(i.quantidade) !== 1 ? ` (qtd ${i.quantidade})` : ''}`).join('\n')
  const dicTxt = (regras ?? []).map((r) => `- ${r.regra}`).join('\n') || '(vazio)'
  const instrucao = `LISTA DE FALTAS:\n${listaTxt}\n\nDICIONÁRIO DA LOJA:\n${dicTxt}\n\nRESPOSTA DO REPRESENTANTE "${representanteNome}":\n` +
    (texto ? `"""\n${texto}\n"""` : '(veja o arquivo anexo)')

  // deno-lint-ignore no-explicit-any
  const content: any[] = []
  if (arquivo) {
    content.push(arquivo.tipo === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: arquivo.base64 } }
      : { type: 'image', source: { type: 'base64', media_type: arquivo.tipo, data: arquivo.base64 } })
  }
  content.push({ type: 'text', text: instrucao })

  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY })
  let resultado: z.infer<typeof RespostaSchema>
  try {
    const resp = await client.messages.parse({
      model: MODELO,
      // Sem streaming, o SDK recusa max_tokens acima de ~21 mil (pode passar de 10 min).
      max_tokens: 20000,
      system: SYSTEM,
      messages: [{ role: 'user', content }],
      output_config: { format: zodOutputFormat(RespostaSchema), effort: 'medium' },
    })
    await logAiUsage(supabaseAdmin, storeId, 'cotacao-ler-resposta', {
      model: MODELO,
      inputTokens: resp.usage?.input_tokens ?? 0,
      outputTokens: resp.usage?.output_tokens ?? 0,
    })
    if (resp.stop_reason === 'refusal') return json({ error: 'A IA não conseguiu ler essa resposta.' }, 422)
    if (resp.stop_reason === 'max_tokens') return json({ error: 'Resposta grande demais pra ler de uma vez. Divida em partes.' }, 422)
    if (!resp.parsed_output) return json({ error: 'A IA devolveu um formato inválido. Tente de novo.' }, 502)
    resultado = resp.parsed_output
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'IA ocupada, tente de novo em 1 minuto.' }, 429)
    if (e instanceof Anthropic.APIError) {
      console.error('Anthropic', e.status, e.message)
      return json({ error: 'Erro ao chamar a IA.' }, 502)
    }
    console.error('Erro interno:', e)
    return json({ error: 'Erro interno' }, 500)
  }

  const { data: resposta, error: respErr } = await supabaseAdmin
    .from('cotacao_respostas')
    .insert({
      store_id: storeId,
      representante_id: representanteId,
      texto: texto || null,
      arquivo_nome: arquivo?.nome ?? null,
      prazo_entrega: resultado.prazo_entrega,
      condicao_frete: resultado.condicao_frete,
      modelo: MODELO,
    })
    .select('id')
    .single()
  if (respErr || !resposta) return json({ error: 'Erro ao salvar a resposta.' }, 500)

  const linhas = resultado.linhas.map((l) => {
    const item = l.item_numero != null && l.item_numero >= 1 && l.item_numero <= itens.length
      ? itens[l.item_numero - 1]
      : null
    return {
      store_id: storeId,
      item_id: item?.id ?? null,
      resposta_id: resposta.id,
      representante_id: representanteId,
      fonte: 'representante',
      texto_original: l.texto_original.slice(0, 1000),
      situacao: l.situacao,
      marca: l.marca,
      preco: l.preco != null && l.preco >= 0 ? Math.round(l.preco * 100) / 100 : null,
      preco_por: l.preco_por,
      motivo: l.motivo.slice(0, 500),
    }
  })

  if (linhas.length > 0) {
    const { error: precosErr } = await supabaseAdmin.from('cotacao_precos').insert(linhas)
    if (precosErr) {
      console.error('Erro ao salvar preços:', precosErr)
      await supabaseAdmin.from('cotacao_respostas').delete().eq('id', resposta.id)
      return json({ error: 'Erro ao salvar os preços.' }, 500)
    }
  }

  return json({
    resposta_id: resposta.id,
    total: linhas.length,
    sem_item: linhas.filter((l) => !l.item_id).length,
    duvidas: linhas.filter((l) => l.situacao === 'duvida').length,
  })
})
