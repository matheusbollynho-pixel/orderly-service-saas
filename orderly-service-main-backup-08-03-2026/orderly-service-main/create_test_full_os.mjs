import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://xqndblstrblqleraepzs.supabase.co'
const anonKey = 'sb_publishable_IbA1JjUujCSjpu-Qi01rwg_FPEoGyS4'

const supabase = createClient(supabaseUrl, anonKey)

const now = new Date()
const stamp = now.getTime().toString().slice(-6)
const cpf = `999888${stamp}`
const placa = `TS${stamp.slice(0, 2)}${stamp.slice(2, 5)}`.slice(0, 7).toUpperCase()

async function run() {
  console.log('🚀 Criando OS de teste completa...')

  // 1) Cliente
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .insert({
      name: `Cliente Teste Completo ${stamp}`,
      cpf,
      phone: '75999998888',
      apelido: 'Teste Completo',
      instagram: '@cliente.teste',
      autoriza_instagram: true,
      endereco: 'Rua do Teste, 123 - Centro',
      cidade: 'Senhor do Bonfim',
      state: 'BA',
      notes: 'Cliente criado automaticamente para teste de impressão'
    })
    .select()
    .single()

  if (clientError) throw new Error(`Erro ao criar cliente: ${clientError.message}`)

  // 2) Moto
  const { data: moto, error: motoError } = await supabase
    .from('motorcycles')
    .insert({
      client_id: client.id,
      placa,
      marca: 'Honda',
      modelo: 'CG 160 FAN',
      ano: 2023,
      cor: 'Preta',
      cilindrada: '160cc',
      motor: 'OHC',
      chassi: `9C2KC${stamp}`,
      notes: 'Moto de teste completa'
    })
    .select()
    .single()

  if (motoError) throw new Error(`Erro ao criar moto: ${motoError.message}`)

  // 3) OS
  const equipment = `${moto.marca} ${moto.modelo} ${moto.ano} ${moto.cor} 25480 km (${moto.placa})`
  const { data: order, error: orderError } = await supabase
    .from('service_orders')
    .insert({
      client_id: client.id,
      motorcycle_id: moto.id,
      client_name: client.name,
      client_cpf: client.cpf,
      client_apelido: client.apelido || '',
      client_instagram: client.instagram || '',
      autoriza_instagram: true,
      client_phone: client.phone || '',
      client_address: client.endereco || '',
      client_birth_date: '1993-05-20',
      equipment,
      problem_description: 'Troca de óleo, revisão geral, ajuste de freio e corrente.\n\nRetirada: Cliente',
      status: 'concluida',
      terms_accepted: true,
      delivery_terms_accepted: true,
      entry_date: now.toISOString(),
      exit_date: new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString(),
    })
    .select()
    .single()

  if (orderError) throw new Error(`Erro ao criar OS: ${orderError.message}`)

  // 4) Checklist
  const checklistPayload = [
    { order_id: order.id, label: 'Freio', completed: true },
    { order_id: order.id, label: 'Chave da MOTO', completed: true },
    { order_id: order.id, label: 'Funcionamento do Motor', completed: true },
    { order_id: order.id, label: 'NÍVEL DE GASOLINA', completed: true },
    { order_id: order.id, label: 'OBSERVAÇÃO', completed: true },
  ]

  const { error: checklistError } = await supabase
    .from('checklist_items')
    .insert(checklistPayload)

  if (checklistError) throw new Error(`Erro ao criar checklist: ${checklistError.message}`)

  // 5) Materiais/serviços
  const materiaisPayload = [
    { order_id: order.id, descricao: 'Óleo 10W30', quantidade: '2', valor: 38.5 },
    { order_id: order.id, descricao: 'Filtro de óleo', quantidade: '1', valor: 25.0 },
    { order_id: order.id, descricao: 'Mão de obra revisão', quantidade: '1', valor: 80.0 },
  ]

  const { error: materiaisError } = await supabase
    .from('materials')
    .insert(materiaisPayload)

  if (materiaisError) throw new Error(`Erro ao criar materiais: ${materiaisError.message}`)

  // 6) Pagamento (best effort)
  const { error: paymentError } = await supabase
    .from('payments')
    .insert({
      order_id: order.id,
      amount: 130,
      discount_amount: 13.0,
      method: 'pix',
      reference: `PIX-TESTE-${stamp}`,
      notes: 'Pagamento de teste completo'
    })

  if (paymentError) {
    console.warn('⚠️ Pagamento não criado (RLS em cash_flow):', paymentError.message)
  }

  const shortId = String(order.id).slice(0, 8).toUpperCase()

  console.log('\n✅ OS de teste criada com sucesso!')
  console.log('🆔 UUID:', order.id)
  console.log('🔢 ID curto:', shortId)
  console.log('👤 Cliente:', client.name)
  console.log('🏍️ Moto:', equipment)
  console.log('💳 Pagamento:', paymentError ? 'não criado (RLS)' : 'criado')
  console.log('🖨️ URL impressão (local):', `http://localhost:8080/imprimir-os/${shortId}`)
}

run().catch((err) => {
  console.error('❌ Falha ao criar OS de teste:', err.message)
  process.exit(1)
})
