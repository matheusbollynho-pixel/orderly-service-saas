// Registra uso de IA por loja (tokens + custo real) e permite checar
// se a loja já estourou o orçamento mensal do plano dela.

// Preço oficial Anthropic em USD por token (não por milhão, pra facilitar a conta).
// Atualizar se a Anthropic mudar o preço ou se outro modelo passar a ser usado.
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-haiku-4-5-20251001': { input: 1 / 1_000_000, output: 5 / 1_000_000 },
}

// Cotação aproximada USD -> BRL, só pra exibir o gasto em reais.
// Ajustar de vez em quando — não é uma cotação em tempo real.
const USD_TO_BRL = 5.3

// Orçamento mensal incluído por plano, em reais. NULL/undefined na loja = usa este default.
// Básico e Pro não vendem IA (só Premium) — ficam com R$0, o que já bloqueia
// qualquer chamada. Pra liberar uma loja específica mesmo fora do Premium,
// usar o override manual em store_settings.ai_monthly_budget_brl (via SuperAdmin).
export const PLAN_BUDGET_BRL: Record<string, number> = {
  trial: 2,
  basic: 0,
  pro: 0,
  premium: 20,
  enterprise: Infinity,
}

// Preço de cache (Anthropic): escrita = 1,25x o input base, leitura = 0,1x.
const CACHE_WRITE_MULT = 1.25
const CACHE_READ_MULT = 0.1

function calcCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheWriteTokens = 0,
  cacheReadTokens = 0,
): number {
  const pricing = MODEL_PRICING[model]
  if (!pricing) return 0
  return (
    inputTokens * pricing.input +
    outputTokens * pricing.output +
    cacheWriteTokens * pricing.input * CACHE_WRITE_MULT +
    cacheReadTokens * pricing.input * CACHE_READ_MULT
  )
}

// Registra uma chamada de IA. Nunca deve derrubar o fluxo principal por causa de um erro aqui.
export async function logAiUsage(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  storeId: string | null | undefined,
  functionName: string,
  usage?: {
    model: string
    inputTokens: number
    outputTokens: number
    cacheWriteTokens?: number
    cacheReadTokens?: number
  }
) {
  if (!storeId) return
  try {
    const cost_usd = usage
      ? calcCostUsd(
          usage.model,
          usage.inputTokens,
          usage.outputTokens,
          usage.cacheWriteTokens ?? 0,
          usage.cacheReadTokens ?? 0,
        )
      : null
    await supabase.from('ai_usage_log').insert({
      store_id: storeId,
      function_name: functionName,
      model: usage?.model ?? null,
      input_tokens: usage?.inputTokens ?? null,
      output_tokens: usage?.outputTokens ?? null,
      cost_usd,
    })
  } catch (e) {
    console.error('logAiUsage falhou:', e)
  }
}

// Verifica se a loja ainda tem orçamento de IA disponível este mês.
// Fail-closed: sem loja identificada ou com erro na checagem, BLOQUEIA — a IA
// roda na chave Anthropic da plataforma, então liberar no escuro é custo nosso
// sem limite (ex: chamada anônima no ai-fill-product, banco fora do ar).
export async function checkAiBudget(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  storeId: string | null | undefined
): Promise<{ allowed: boolean; spentBrl: number; budgetBrl: number }> {
  if (!storeId) return { allowed: false, spentBrl: 0, budgetBrl: 0 }
  try {
    const { data: store, error: storeErr } = await supabase
      .from('store_settings')
      .select('plan, ai_monthly_budget_brl')
      .eq('id', storeId)
      .maybeSingle()
    if (storeErr || !store) throw storeErr ?? new Error('loja não encontrada')

    const budgetBrl = store.ai_monthly_budget_brl ?? PLAN_BUDGET_BRL[store.plan ?? 'trial'] ?? PLAN_BUDGET_BRL.trial
    if (budgetBrl === Infinity) return { allowed: true, spentBrl: 0, budgetBrl }

    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    const { data: rows, error: rowsErr } = await supabase
      .from('ai_usage_log')
      .select('cost_usd')
      .eq('store_id', storeId)
      .gte('created_at', startOfMonth.toISOString())

    if (rowsErr) throw rowsErr

    const spentUsd = (rows || []).reduce((s: number, r: { cost_usd: number | null }) => s + (r.cost_usd || 0), 0)
    const spentBrl = spentUsd * USD_TO_BRL

    return { allowed: spentBrl < budgetBrl, spentBrl, budgetBrl }
  } catch (e) {
    console.error('checkAiBudget falhou, bloqueando IA por segurança (custo da plataforma):', e)
    return { allowed: false, spentBrl: 0, budgetBrl: 0 }
  }
}
