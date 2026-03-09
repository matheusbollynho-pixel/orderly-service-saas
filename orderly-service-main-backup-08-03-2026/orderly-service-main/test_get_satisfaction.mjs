const SUPABASE_URL = 'https://xqndblstrblqleraepzs.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxbmRibHN0cmJscWxlcmFlcHpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzQ0NDczMTIsImV4cCI6MjA1MDAyMzMxMn0.g1b3WrBCcyMu9Ob-hWUBN-KGRLq1Pk5H_f3B5O3EuBk';

// Use um token de teste que você criou
const testToken = process.argv[2] || 'test-1735938735942';

console.log(`🧪 Testando GET satisfaction com token: ${testToken}`);

const url = `${SUPABASE_URL}/functions/v1/satisfaction-public?token=${testToken}`;

try {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ANON_KEY}`
    }
  });

  const data = await response.json();
  
  console.log('\n📊 Status:', response.status);
  console.log('\n📦 Response completa:');
  console.log(JSON.stringify(data, null, 2));

  if (data.success) {
    console.log('\n✅ Sucesso!');
    console.log('🧑 Atendimento:', data.atendimento);
    console.log('🔧 Mecânico:', data.mechanic);
    console.log('📋 Order:', data.order);
  } else {
    console.log('\n❌ Erro:', data.message);
  }
} catch (error) {
  console.error('❌ Erro na requisição:', error.message);
}
