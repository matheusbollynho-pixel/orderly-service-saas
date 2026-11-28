// "Pergunte ao financeiro": o dono pergunta, a IA responde só com os números que o sistema calculou.
// POST { pergunta, historico?: [{ role, content }] } com o login do usuário.
// Loja e permissão vêm do banco (quem vê Relatórios). Custo: orçamento de IA do plano (checkAiBudget).
import Anthropic from 'npm:@anthropic-ai/sdk@^1'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { checkAiBudget, logAiUsage } from '../_shared/aiUsage.ts'
import { hojeLoja, type DadosFinanceiro } from '../_shared/financeiro/mensagem.ts'
import { INSTRUCOES_FINANCEIRO, historicoSeguro, periodoParaIA, periodosDaPergunta, situacaoParaIA } from '../_shared/financeiro/pergunta.ts'

const URL = Deno.env.get('SUPABASE_URL')!
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const MODELO = 'claude-haiku-5-5'
const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('CORS_ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
}
const resp = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json', ...cors } })
const erro = (msg: string, status = 400) => resp({ error: msg }, status)

const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })
const claude = new Anthropic() // lê ANTHROPIC_API_KEY dos segredos da função

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') return erro('Método não permitido', 405)
  try {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
    if (!token) return erro('Não autorizado', 401)
    const { data: u } = await admin.auth.getUser(token)
    if (!u?.user) return erro('Não autorizado', 401)
    const comoUsuario = createClient(URL, ANON, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } })
    const { data: loja } = await comoUsuario.rpc('get_my_store_id')
    if (!loja) return erro('Usuário sem loja', 403)
    const { data: pode } = await comoUsuario.rpc('pode_acao', { acao: 'relatorios' })
    if (pode !== true) return erro('Sem permissão de Relatórios para ver o financeiro.', 403)

    const corpo = await req.json().catch(() => null) as { pergunta?: unknown; historico?: unknown } | null
    const pergunta = typeof corpo?.pergunta === 'string' ? corpo.pergunta.trim().slice(0, 500) : ''
    if (pergunta.length < 3) return erro('Escreva a pergunta.')

    const orcamento = await checkAiBudget(admin, loja)
    if (!orcamento.allowed) {
      return erro(orcamento.budgetBrl > 0
        ? 'O limite de uso da IA deste mês acabou. Fale com o suporte para liberar mais.'
        : 'A IA do financeiro é do plano Premium.', 402)
    }

    // Números de cada período, calculados pelo banco com o login do usuário (mesma regra do Resumo)
    const hoje = hojeLoja()
    const periodos = periodosDaPergunta(hoje)
    const calculados = await Promise.all(periodos.map(async (p) => {
      const { data, error } = await comoUsuario.rpc('financeiro_resumo', { p_store_id: loja, p_ini: p.ini, p_fim: p.fim })
      if (error) throw new Error(error.message)
      return { p, d: data as DadosFinanceiro }
    }))
    const { data: info } = await admin.from('store_settings').select('company_name').eq('id', loja).single()
    const dados = {
      loja: info?.company_name ?? 'loja',
      hoje,
      periodos: calculados.map(({ p, d }) => periodoParaIA(p.nome, d)),
      situacao_agora: situacaoParaIA(calculados[0].d as Parameters<typeof situacaoParaIA>[0]),
    }

    const r = await claude.messages.create({
      model: MODELO,
      max_tokens: 2048, // sobra para o raciocínio, que conta neste limite
      output_config: { effort: 'low' },
      cache_control: { type: 'ephemeral' },
      system: [
        { type: 'text', text: INSTRUCOES_FINANCEIRO },
        { type: 'text', text: `DADOS (JSON):\n${JSON.stringify(dados)}` },
      ],
      messages: [...historicoSeguro(corpo?.historico), { role: 'user', content: pergunta }],
    })

    await logAiUsage(admin, loja, 'financeiro-perguntar', {
      model: MODELO,
      inputTokens: r.usage.input_tokens,
      outputTokens: r.usage.output_tokens,
      cacheWriteTokens: r.usage.cache_creation_input_tokens ?? 0,
      cacheReadTokens: r.usage.cache_read_input_tokens ?? 0,
    })

    if (r.stop_reason === 'refusal') return resp({ resposta: 'Não consigo responder essa pergunta. Tente perguntar de outro jeito sobre vendas, caixa ou contas.' })
    const texto = r.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('\n').trim()
    if (!texto) return erro('A IA não conseguiu responder agora. Tente de novo.', 502)
    return resp({ resposta: texto })
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return erro('A IA está ocupada agora. Tente de novo em 1 minuto.', 429)
    if (e instanceof Anthropic.APIError) {
      console.error('financeiro-perguntar: erro da IA', e.status, e.message)
      return erro('A IA não respondeu agora. Tente de novo em instantes.', 502)
    }
    console.error('financeiro-perguntar:', e)
    return erro('Não consegui montar a resposta. Tente de novo.', 500)
  }
})
