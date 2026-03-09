/**
 * Script para submeter uma avaliação de satisfação completa via API
 */

const SUPABASE_URL = 'https://xqndblstrblqleraepzs.supabase.co'
const testToken = 'test-1772735682232' // Token gerado pelo script anterior

console.log('📝 Submetendo avaliação de teste via API...\n')

const payload = {
  token: testToken,
  atendimento_rating: 5,
  servico_rating: 5,
  recommends: true,
  comment: 'Ótimo atendimento! Serviço impecável, equipe muito atenciosa e profissional. Recomendo!',
  tags: {
    atendimento: ['Atencioso', 'Rápido', 'Profissional'],
    servico: ['Qualidade', 'Prazo cumprido', 'Preço justo']
  }
}

console.log('Payload:', JSON.stringify(payload, null, 2))
console.log('\n🔗 Token:', testToken)
console.log('📍 URL:', `${SUPABASE_URL}/functions/v1/satisfaction-public\n`)

try {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/satisfaction-public`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })

  const text = await response.text()
  console.log('Status:', response.status, response.statusText)
  console.log('Response:', text)

  if (response.ok) {
    console.log('\n✅ Avaliação submetida com sucesso!')
    console.log('🎉 Agora você pode ver a avaliação na página de Satisfação!')
  } else {
    console.error('\n❌ Erro ao submeter avaliação')
  }
} catch (error) {
  console.error('❌ Erro:', error.message)
}
