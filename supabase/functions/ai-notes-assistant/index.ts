import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { logAiUsage, checkAiBudget } from '../_shared/aiUsage.ts'

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

// Resolve o store_id a partir do usuário autenticado — nunca confia num
// store_id vindo do corpo da requisição, pra não misturar dados de lojas.
async function resolveStoreId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return null
  const token = authHeader.replace('Bearer ', '')
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

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
  if (!ANTHROPIC_API_KEY) return json({ error: 'ANTHROPIC_API_KEY não configurada' }, 500)

  const storeId = await resolveStoreId(req)
  if (!storeId) return json({ error: 'Não autorizado' }, 401)

  let message: string
  let history: ChatMessage[]
  let vehicleLabel: string
  try {
    const body = await req.json()
    message = (body.message || '').trim()
    history = Array.isArray(body.history) ? body.history.slice(-10) : []
    vehicleLabel = body.vehicle_label === 'Carro' ? 'carro' : 'moto'
    if (!message) return json({ error: 'message é obrigatório' }, 400)
  } catch {
    return json({ error: 'JSON inválido' }, 400)
  }

  const { data: settings } = await supabaseAdmin
    .from('store_settings')
    .select('company_name, ai_notes')
    .eq('id', storeId)
    .maybeSingle()

  const companyName = settings?.company_name || 'a oficina'
  const currentNotes = (settings?.ai_notes || '').trim() || '(ainda vazio, nenhuma nota cadastrada)'

  const systemPrompt = `Você ajuda o dono da oficina "${companyName}" (atende ${vehicleLabel}s) a organizar as notas de configuração do atendente virtual de WhatsApp da loja. O nome desse atendente virtual é "Max" — é o próprio assistente de IA desta loja no WhatsApp, não é um produto ou plataforma externa. Não existe nenhum outro produto chamado "Max Horários" ou parecido — se o dono mencionar algo assim, entenda que ele está falando do Max (o assistente desta loja) e do horário de funcionamento, não de outro sistema.

Como esse chat funciona de verdade (importante, explique isso quando perguntarem "isso muda os dados de verdade?" ou similar):
- Toda sugestão de regra que você propor aparece pro dono com um botão "+ Adicionar às notas" na tela.
- Ao clicar, o texto é adicionado DE VERDADE ao campo de notas desta loja.
- Depois, ao clicar em "Salvar configurações da IA" (botão no fim da página), a mudança é salva no banco e passa a valer pro Max imediatamente.
- Ou seja: SIM, mudar aqui muda de verdade o que o Max sabe — não precisa ir em nenhum outro painel, plataforma ou sistema. É tudo aqui mesmo, nesta página de Configurações.

Seu papel:
- Responder perguntas sobre o que já está cadastrado (ex: "eu já falei sobre horário de funcionamento?").
- Avisar quando algo que o dono está descrevendo agora parece repetir ou contradizer uma nota já existente.
- Ajudar a formular a regra de um jeito claro e curto, pronta pra ser adicionada às notas.
- Quando faltar informação pra formular a regra direito, pergunte antes de sugerir (ex: "que horas abre e fecha?").

Regras importantes:
- Fale APENAS sobre configuração de atendimento desta loja (preços, regras, restrições, horários, tom de voz, promoções). NUNCA responda perguntas fora desse assunto (política, receitas, outras empresas, assuntos pessoais, etc) — se perguntarem algo assim, recuse educadamente e volte o foco pras notas da loja.
- Não invente informação sobre a loja que não esteja nas notas atuais ou na mensagem do dono.
- Seja direto e breve — isso é um chat de configuração, não uma conversa longa.
- NUNCA mande o dono "procurar quem configurou o sistema", "verificar com o suporte técnico" ou "consultar a plataforma" pra dúvidas sobre como este chat funciona — você já sabe a resposta, é a que está descrita acima. Só admita que não sabe algo quando for realmente fora do que você pode responder (ex: um bug técnico, uma cobrança, algo que não é sobre as notas de atendimento) — nesse caso, e SOMENTE nesse caso, diga que pra isso o suporte é pelo WhatsApp (75) 98838-8629.
- Quando (e SOMENTE quando) você já tiver uma regra pronta e completa pra adicionar às notas, termine sua resposta com uma linha separada, sozinha, EXATAMENTE neste formato (sem aspas, sem markdown):
SUGESTAO: texto final da regra pronta pra salvar
Não inclua essa linha se ainda estiver só conversando, perguntando algo, ou respondendo uma dúvida sobre o que já existe.`

  const budget = await checkAiBudget(supabaseAdmin, storeId)
  if (!budget.allowed) {
    return json({ error: `Limite de IA do plano atingido este mês (R$ ${budget.spentBrl.toFixed(2)} de R$ ${budget.budgetBrl.toFixed(2)}). Fale com o suporte pra liberar mais.` }, 402)
  }

  const messages = [
    ...history.filter(m => m.role === 'user' || m.role === 'assistant').map(m => ({ role: m.role, content: String(m.content).slice(0, 2000) })),
    { role: 'user', content: message },
  ]

  const model = 'claude-haiku-4-5-20251001'

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 512,
        system: systemPrompt,
        messages,
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('Anthropic error:', err)
      return json({ error: 'Erro ao chamar Claude API' }, 502)
    }

    const result = await response.json()

    await logAiUsage(supabaseAdmin, storeId, 'ai-notes-assistant', {
      model,
      inputTokens: result.usage?.input_tokens ?? 0,
      outputTokens: result.usage?.output_tokens ?? 0,
    })

    const rawText: string = result.content?.[0]?.text ?? ''

    // Extrai a linha "SUGESTAO: ..." do final, se houver, separando do texto exibido.
    const lines = rawText.split('\n')
    let suggestion: string | null = null
    const lastLine = lines[lines.length - 1]?.trim() ?? ''
    if (lastLine.toUpperCase().startsWith('SUGESTAO:')) {
      suggestion = lastLine.slice(lastLine.indexOf(':') + 1).trim()
      lines.pop()
    }
    const reply = lines.join('\n').trim()

    return json({ reply, suggestion })
  } catch (err) {
    console.error('Erro interno:', err)
    return json({ error: 'Erro interno' }, 500)
  }
})
