import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://xqndblstrblqleraepzs.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxbmRibHN0cmJscWxlcmFlcHpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc4MzMxODAsImV4cCI6MjA2MzQwOTE4MH0.6aMbWXOZqLH4qbOGSzW5QTbPTU2x54K_vFEWYq3jfg4'

const supabase = createClient(supabaseUrl, supabaseKey)

console.log('🔍 Testando busca direta nas tabelas...\n')

// Teste 1: Buscar staff_members
console.log('📦 Buscando staff_members...')
const { data: staff, error: staffError } = await supabase
  .from('staff_members')
  .select('id, name')
  .order('name')

console.log('Resultado staff_members:', {
  count: staff?.length || 0,
  data: staff,
  error: staffError
})

// Teste 2: Buscar mechanics
console.log('\n🔧 Buscando mechanics...')
const { data: mechs, error: mechError } = await supabase
  .from('mechanics')
  .select('id, name')
  .order('name')

console.log('Resultado mechanics:', {
  count: mechs?.length || 0,
  data: mechs,
  error: mechError
})

// Teste 3: Chamar a Edge Function
console.log('\n🌐 Chamando Edge Function...')
const response = await fetch(`${supabaseUrl}/functions/v1/satisfaction-public?mode=store-metadata`, {
  headers: {
    'Authorization': `Bearer ${supabaseKey}`
  }
})

const result = await response.json()
console.log('Resultado Edge Function:', result)

// Verificar logs da função
console.log('\n📊 Status HTTP:', response.status)
