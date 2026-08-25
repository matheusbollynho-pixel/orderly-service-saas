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

function calcCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model]
  if (!pricing) return 0
  return inputTokens * pricing.input + outputTokens * pricing.output
}

// Registra uma chamada de IA. Nunca deve derrubar o fluxo principal por causa de um erro aqui.
export async function logAiUsage(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  storeId: string | null | undefined,
  functionName: string,
  usage?: { model: string; inputTokens: number; outputTokens: number }
) {
  if (!storeId) return
  try {
    const cost_usd = usage ? calcCostUsd(usage.model, usage.inputTokens, usage.outputTokens) : null
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
// Em caso de erro na checagem, deixa passar (nunca bloqueia por falha interna nossa).
export async function checkAiBudget(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  storeId: string | null | undefined
): Promise<{ allowed: boolean; spentBrl: number; budgetBrl: number }> {
  if (!storeId) return { allowed: true, spentBrl: 0, budgetBrl: Infinity }
  try {
    const { data: store } = await supabase
      .from('store_settings')
      .select('plan, ai_monthly_budget_brl')
      .eq('id', storeId)
      .maybeSingle()

    const budgetBrl = store?.ai_monthly_budget_brl ?? PLAN_BUDGET_BRL[store?.plan ?? 'trial'] ?? PLAN_BUDGET_BRL.trial
    if (budgetBrl === Infinity) return { allowed: true, spentBrl: 0, budgetBrl }

    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    const { data: rows } = await supabase
      .from('ai_usage_log')
      .select('cost_usd')
      .eq('store_id', storeId)
      .gte('created_at', startOfMonth.toISOString())

    const spentUsd = (rows || []).reduce((s: number, r: { cost_usd: number | null }) => s + (r.cost_usd || 0), 0)
    const spentBrl = spentUsd * USD_TO_BRL

    return { allowed: spentBrl < budgetBrl, spentBrl, budgetBrl }
  } catch (e) {
    console.error('checkAiBudget falhou, liberando por segurança:', e)
    return { allowed: true, spentBrl: 0, budgetBrl: Infinity }
  }
}
