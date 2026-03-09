import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://xqndblstrblqleraepzs.supabase.co'
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxbmRibHN0cmJscWxlcmFlcHpzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzgzMzE4MCwiZXhwIjoyMDYzNDA5MTgwfQ.TZTlco5OVFxnGnBaXLduhd1FyJ5MZXPAuxYjE3qBGbQ'

const supabase = createClient(supabaseUrl, serviceKey)

console.log('🗑️ Deletando avaliações walk-in de teste...\n')

// Deletar ratings walk-in que ainda não foram respondidos
const { data: ratings, error } = await supabase
  .from('satisfaction_ratings')
  .delete()
  .like('token', 'walkin-%')
  .is('responded_at', null)
  .select()

if (error) {
  console.error('❌ Erro:', error)
} else {
  console.log(`✅ ${ratings?.length || 0} avaliação(ões) walk-in pendente(s) deletada(s)`)
  ratings?.forEach(r => {
    console.log(`  - Token: ${r.token}`)
  })
}
