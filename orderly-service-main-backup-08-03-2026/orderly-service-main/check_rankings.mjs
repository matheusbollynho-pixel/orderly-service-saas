import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const sb = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY
)

console.log('🔍 Checando satisfaction_ratings...')
const { data: all } = await sb
  .from('satisfaction_ratings')
  .select('id, responded_at, atendimento_rating, servico_rating, atendimento_id, mechanic_id, order_id')

console.log('📊 Total de registros:', all?.length || 0)
console.log('Primeiros 3:', JSON.stringify(all?.slice(0, 3), null, 2))

const { data: responded } = await sb
  .from('satisfaction_ratings')
  .select('id, responded_at, atendimento_rating, servico_rating, atendimento_id, mechanic_id')
  .not('responded_at', 'is', null)

console.log('\n✅ Respondidas:', responded?.length || 0)
if (responded?.length > 0) {
  console.log('Primeiras respondidas:', JSON.stringify(responded.slice(0, 3), null, 2))
}
