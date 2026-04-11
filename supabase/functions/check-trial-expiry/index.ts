import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

Deno.serve(async () => {
  const now = new Date().toISOString()

  // Busca lojas trial com trial_ends_at expirado e ainda ativas
  const { data: expired, error } = await supabase
    .from('store_settings')
    .select('id, company_name, trial_ends_at')
    .eq('plan', 'trial')
    .eq('active', true)
    .lt('trial_ends_at', now)

  if (error) {
    console.error('Erro ao buscar trials:', error.message)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  if (!expired || expired.length === 0) {
    console.log('Nenhum trial expirado.')
    return new Response(JSON.stringify({ disabled: 0 }), { status: 200 })
  }

  const ids = expired.map((s: any) => s.id)

  // Desativa as lojas
  await supabase
    .from('store_settings')
    .update({ active: false })
    .in('id', ids)

  // Atualiza subscriptions para cancelled
  await supabase
    .from('saas_subscriptions')
    .update({ status: 'cancelled' })
    .in('store_id', ids)
    .eq('status', 'pending')

  console.log(`✅ ${expired.length} trial(s) expirado(s) desativado(s):`, expired.map((s: any) => s.company_name))

  return new Response(JSON.stringify({ disabled: expired.length, stores: expired.map((s: any) => s.company_name) }), { status: 200 })
})
