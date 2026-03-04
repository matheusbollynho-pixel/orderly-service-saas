/**
 * Script para inserir dados de teste de satisfação com mechanic_id e atendimento_id preenchidos
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://xqndblstrblqleraepzs.supabase.co'
const supabaseKey = 'sb_publishable_IbA1JjUujCSjpu-Qi01rwg_FPEoGyS4'

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Variáveis de ambiente não definidas')
  console.error('VITE_SUPABASE_URL:', supabaseUrl)
  console.error('VITE_SUPABASE_PUBLISHABLE_KEY:', supabaseKey)
  process.exit(1)
}

const sb = createClient(supabaseUrl, supabaseKey)

async function main() {
  // Primeiro, buscamos IDs reais de ordens, mecânicos e atendentes
  console.log('🔍 Buscando dados existentes...')

  const { data: orders } = await sb.from('service_orders').select('id, mechanic_id, atendimento_id').limit(1)
  const { data: mechanics } = await sb.from('mechanics').select('id').limit(1)
  const { data: staff } = await sb.from('staff_members').select('id').limit(1)

  const orderId = orders?.[0]?.id
  const mechanicId = mechanics?.[0]?.id
  const staffId = staff?.[0]?.id

  console.log('📦 IDs encontrados:', { orderId, mechanicId, staffId })

  if (!orderId || !mechanicId || !staffId) {
    console.warn('⚠️  Faltam dados para criar rating de teste. Criando com IDs parciais...')
  }

  // Inserir uma avaliação de teste com dados completos
  const testToken = 'test-' + Date.now()
  const { data, error } = await sb.from('satisfaction_ratings').insert({
    order_id: orderId || 'fake-order-id',
    client_id: null,
    mechanic_id: mechanicId,
    atendimento_id: staffId,
    public_token: testToken,
    status: 'pendente',
    atendimento_rating: 5,
    servico_rating: 5,
    recommends: true,
    tags: { atendimento: ['Educação', 'Rapidez'], servico: ['Qualidade', 'Bem Feito'] },
    comment: 'Avaliação de teste - Excelente atendimento!',
    responded_at: new Date().toISOString(),
  }).select()

  if (error) {
    console.error('❌ Erro ao inserir:', error)
  } else {
    console.log('✅ Avaliação de teste inserida:', data)
    console.log('\n📊 Dados salvos:')
    console.log('   - order_id:', orderId)
    console.log('   - mechanic_id:', mechanicId)
    console.log('   - atendimento_id:', staffId)
    console.log('   - servico_rating: 5')
    console.log('   - atendimento_rating: 5')
    console.log('\n🔗 Token:', testToken)
  }

  // Agora vamos verificar quantas avaliações têm mechanic_id preenchido
  console.log('\n📈 Verificando status das avaliações...')
  const { data: allRatings } = await sb
    .from('satisfaction_ratings')
    .select('id, mechanic_id, atendimento_id, servico_rating, atendimento_rating, responded_at')
    .not('responded_at', 'is', null)

  console.log('Total respondidas:', allRatings?.length)
  console.log('Com mechanic_id:', allRatings?.filter(r => r.mechanic_id).length)
  console.log('Com atendimento_id:', allRatings?.filter(r => r.atendimento_id).length)
  console.log('Com servico_rating:', allRatings?.filter(r => r.servico_rating).length)
  console.log('Com atendimento_rating:', allRatings?.filter(r => r.atendimento_rating).length)

  if (allRatings?.length > 0) {
    console.log('\nPrimeiras 3 avaliações:')
    allRatings.slice(0, 3).forEach((r, i) => {
      console.log(`  ${i + 1}. mechanic_id=${r.mechanic_id}, atendimento_id=${r.atendimento_id}, servico=${r.servico_rating}, atend=${r.atendimento_rating}`)
    })
  }
}

main().catch(console.error)
