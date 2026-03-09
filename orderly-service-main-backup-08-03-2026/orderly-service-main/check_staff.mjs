import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://xqndblstrblqleraepzs.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxbmRibHN0cmJscWxlcmFlcHp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg2MjI3NzMsImV4cCI6MjA1NDE5ODc3M30.XOAJKA0OYeWs0YrYGSVXJtdAznxPvJ0wevFrYnLOTOI'

const sb = createClient(supabaseUrl, supabaseKey)

async function main() {
  console.log('🔍 Verificando atendentes...')

  const { data: staff, error: staffError } = await sb
    .from('staff_members')
    .select('id, name')
    .limit(10)

  const { data: mechanics, error: mechanicsError } = await sb
    .from('mechanics')
    .select('id, name')
    .limit(10)

  console.log('\n📊 STAFF MEMBERS:')
  console.log('Total:', staff?.length || 0)
  if (staff?.length > 0) {
    staff.forEach(s => console.log(`  - ${s.name} (${s.id})`))
  } else {
    console.log('  ⚠️  Nenhum staff member encontrado')
  }

  console.log('\n🔧 MECHANICS:')
  console.log('Total:', mechanics?.length || 0)
  if (mechanics?.length > 0) {
    mechanics.forEach(m => console.log(`  - ${m.name} (${m.id})`))
  } else {
    console.log('  ⚠️  Nenhum mecânico encontrado')
  }

  if (staffError) console.error('Erro staff:', staffError)
  if (mechanicsError) console.error('Erro mechanics:', mechanicsError)
}

main()
