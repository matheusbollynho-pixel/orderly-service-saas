import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

// Roda diariamente — pausa lojas com pagamento vencido há mais de X dias de carência
const GRACE_DAYS = 3 // dias de carência após o vencimento

Deno.serve(async () => {
  const now = new Date()
  const graceCutoff = new Date(now)
  graceCutoff.setDate(graceCutoff.getDate() - GRACE_DAYS)
  const cutoff = graceCutoff.toISOString().split('T')[0] // YYYY-MM-DD

  console.log(`Verificando inadimplência — vencimentos antes de ${cutoff} (${GRACE_DAYS} dias de carência)`)

  // Busca assinaturas ativas com vencimento passado (além da carência)
  const { data: overdue, error } = await supabase
    .from('saas_subscriptions')
    .select('id, store_id, owner_email, plan, due_date')
    .eq('status', 'active')
    .not('due_date', 'is', null)
    .lt('due_date', cutoff)

  if (error) {
    console.error('Erro ao buscar assinaturas:', error.message)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  if (!overdue || overdue.length === 0) {
    console.log('Nenhuma assinatura vencida.')
    return new Response(JSON.stringify({ paused: 0 }), { status: 200 })
  }

  const storeIds = [...new Set(overdue.map((s: any) => s.store_id))]
  const subIds = overdue.map((s: any) => s.id)

  // Marca assinaturas como overdue
  await supabase
    .from('saas_subscriptions')
    .update({ status: 'overdue' })
    .in('id', subIds)

  // Desativa as lojas correspondentes
  await supabase
    .from('store_settings')
    .update({ active: false })
    .in('id', storeIds)

  console.log(`⚠️ ${storeIds.length} loja(s) pausada(s) por inadimplência:`, overdue.map((s: any) => `${s.store_id} (venc. ${s.due_date})`))

  return new Response(JSON.stringify({
    paused: storeIds.length,
    stores: overdue.map((s: any) => ({ store_id: s.store_id, due_date: s.due_date, email: s.owner_email }))
  }), { status: 200 })
})
