// Registra uma chamada de IA pra permitir medir uso por loja depois.
// Nunca deve derrubar o fluxo principal por causa de um erro aqui.
export async function logAiUsage(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  storeId: string | null | undefined,
  functionName: string
) {
  if (!storeId) return
  try {
    await supabase.from('ai_usage_log').insert({ store_id: storeId, function_name: functionName })
  } catch (e) {
    console.error('logAiUsage falhou:', e)
  }
}
