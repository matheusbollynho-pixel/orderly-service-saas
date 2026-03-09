const supabaseUrl = 'https://xqndblstrblqleraepzs.supabase.co'
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxbmRibHN0cmJscWxlcmFlcHpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc4MzMxODAsImV4cCI6MjA2MzQwOTE4MH0.6aMbWXOZqLH4qbOGSzW5QTbPTU2x54K_vFEWYq3jfg4'

console.log('🧪 Testando create_walkin...\n')

const response = await fetch(`${supabaseUrl}/functions/v1/satisfaction-public`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${anonKey}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    mode: 'create_walkin',
    client_name: 'Teste João',
    client_phone: '75999887766'
  })
})

console.log('Status:', response.status)
console.log('Status text:', response.statusText)

const data = await response.json()
console.log('\nResponse:', JSON.stringify(data, null, 2))
