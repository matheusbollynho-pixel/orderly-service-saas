/**
 * Script para enviar link de satisfação direto (sem passar pela função anterior)
 */
(async () => {
  try {
    console.log('🚀 Enviando link de satisfação para Matheus...\n');
    
    // Passo 1: Buscar cliente
    const { supabase } = await import('/src/integrations/supabase/client.ts');
    const sb = supabase;
    
    // Buscar ordem de Matheus pelo telefone
    const { data: orders, error: ordersError } = await sb
      .from('service_orders')
      .select('id, client_name, client_phone, client_apelido')
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (ordersError || !orders?.length) {
      console.error('❌ Nenhuma ordem encontrada:', ordersError);
      return;
    }
    
    const order = orders[0];
    console.log('✅ Ordem encontrada:', {
      id: order.id,
      nome: order.client_name,
      telefone: order.client_phone,
      apelido: order.client_apelido
    });
    
    // Passo 2: Buscar ou criar satisfaction_rating
    const { data: existing, error: existingError } = await sb
      .from('satisfaction_ratings')
      .select('id, public_token, responded_at')
      .eq('order_id', order.id)
      .limit(1);
    
    let token;
    
    if (existing?.length > 0) {
      token = existing[0].public_token;
      console.log('✅ Rating existente encontrado, token:', token);
    } else {
      // Criar novo
      const newToken = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
      const { data: created, error: createError } = await sb
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
        console.error('❌ Erro ao criar rating:', createError);
        return;
      }
      
      token = created?.public_token || newToken;
      console.log('✅ Rating criado com token:', token);
    }
    
    // Passo 3: Montar URL
    const baseUrl = window.location.origin;
    const satisfactionUrl = `${baseUrl}/avaliar/${token}`;
    
    console.log('\n🔗 URL de satisfação:', satisfactionUrl);
    
    // Passo 4: Enviar via WhatsApp
    const { sendWhatsAppText } = await import('/src/services/whatsappService.ts');
    
    const SATISFACTION_MESSAGE = `Olá, ${order.client_name}! 👋

Aqui é da *Bandara Motos*.

Sua opinião é muito importante para melhorarmos sempre.
Pode avaliar seu atendimento em menos de 1 minuto? ⭐

${satisfactionUrl}

Obrigado pela confiança! 🏍️🔧`;
    
    await sendWhatsAppText({
      phone: order.client_phone,
      text: SATISFACTION_MESSAGE
    });
    
    console.log('✅ Mensagem enviada com sucesso via WhatsApp!');
    console.log('\n📱 Dados do envio:');
    console.log('  Telefone:', order.client_phone);
    console.log('  Nome:', order.client_name);
    console.log('  Token:', token);
    console.log('  URL:', satisfactionUrl);
    
  } catch (error) {
    console.error('❌ Erro:', error);
  }
})();
