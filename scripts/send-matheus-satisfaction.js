/**
 * Script para enviar link de satisfação para Matheus
 * Execute no console do navegador (F12 > Console)
 */

(async () => {
  try {
    console.log('🚀 Iniciando envio de link de satisfação...');
    
    // Importar a função
    const { sendSatisfactionLinkToClient } = await import('./src/lib/sendSatisfactionLink.ts');
    
    // Enviar para Matheus
    const result = await sendSatisfactionLinkToClient({
      phone: '75988388629',
      clientName: 'Matheus',
      apelido: 'bollynho',
    });
    
    console.log('📨 Resultado:', result);
    
    if (result.success) {
      console.log('✅ Link enviado com sucesso!');
      console.log('📱 Token:', result.token);
      console.log('🔗 URL:', result.url);
    } else {
      console.error('❌ Erro:', result.message);
    }
  } catch (error) {
    console.error('❌ Erro ao executar:', error);
  }
})();
