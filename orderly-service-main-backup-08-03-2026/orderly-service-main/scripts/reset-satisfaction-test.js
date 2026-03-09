/**
 * Script para resetar avaliação de teste e enviar novo link
 * Execute no console do navegador (F12 > Console)
 */
(async () => {
  try {
    console.log('🔄 Resetando avaliação anterior...\n');
    
    const { supabase } = window;
    
    // 1. Buscar ordem recente
    const { data: orders } = await supabase
      .from('service_orders')
      .select('id, client_name, client_phone')
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (!orders?.length) {
      console.error('❌ Nenhuma ordem encontrada');
      return;
    }
    
    const order = orders[0];
    console.log('📋 Ordem:', order.id, '-', order.client_name);
    
    // 2. Deletar registro anterior de satisfação
    const { data: deleted, error: deleteError } = await supabase
      .from('satisfaction_ratings')
      .delete()
      .eq('order_id', order.id);
    
    if (deleteError) {
      console.error('❌ Erro ao deletar:', deleteError);
      return;
    }
    
    console.log('✅ Registro anterior deletado');
    
    // 3. Criar novo registro
    const newToken = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
    
    const { data: created, error: createError } = await supabase
      .from('satisfaction_ratings')
      .insert({
        order_id: order.id,
        client_id: null,
        atendimento_id: null,
        mechanic_id: null,
        public_token: newToken,
        status: 'pendente',
      })
      .select('public_token')
      .single();
    
    if (createError) {
      console.error('❌ Erro ao criar:', createError);
      return;
    }
    
    console.log('✅ Novo registro criado');
    
    // 4. Montar URL
    const baseUrl = window.location.origin;
    const satisfactionUrl = `${baseUrl}/avaliar/${created.public_token}`;
    
    console.log('\n✅ NOVO LINK DE TESTE:');
    console.log('📍 URL:', satisfactionUrl);
    console.log('🔗 Link copiável:', satisfactionUrl);
    console.log('\n👉 Abra este link em outra aba para testar\n');
    
  } catch (error) {
    console.error('❌ Erro:', error);
  }
})();
