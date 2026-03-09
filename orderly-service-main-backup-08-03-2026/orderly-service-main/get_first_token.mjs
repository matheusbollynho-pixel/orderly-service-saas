import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  'https://xqndblstrblqleraepzs.supabase.co',
  'sb_publishable_IbA1JjUujCSjpu-Qi01rwg_FPEoGyS4'
)

const { data } = await sb
  .from('satisfaction_ratings')
  .select('public_token, mechanic_id, atendimento_id, responded_at')
  .not('responded_at', 'is', null)
  .order('created_at', { ascending: true })
  .limit(2)

console.log('Primeiras 2 avaliações respondidas:')
data.forEach((r, i) => {
  console.log(`${i+1}. Token: ${r.public_token}`)
  console.log(`   Mechanic: ${r.mechanic_id}, Atend: ${r.atendimento_id}`)
})
