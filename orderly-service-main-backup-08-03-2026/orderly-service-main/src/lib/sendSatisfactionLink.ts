import { supabase } from '@/integrations/supabase/client';
import { sendWhatsAppText } from '@/services/whatsappService';

/**
 * Envia link de satisfação via WhatsApp para um cliente específico
 */
export async function sendSatisfactionLinkToClient(params: {
  phone: string;
  clientName?: string;
  apelido?: string;
}): Promise<{ success: boolean; message: string; token?: string; url?: string; debug?: unknown }> {
  try {
    const { phone, clientName, apelido } = params;
    
    if (!phone) {
      return { success: false, message: 'Telefone é obrigatório' };
    }

    // SupabaseClient já tipado
    const sb = supabase;
    console.log('📱 Enviando link de satisfação...', { phone, clientName, apelido });

    // Normalizar telefone
    const phoneDigits = phone.replace(/\D/g, '');
    console.log('🔍 Telefone normalizado:', phoneDigits);
    
    // Buscar ordem de serviço
    const { data: orders, error: ordersError } = await sb
      .from('service_orders')
      .select('id, client_name, client_phone, client_apelido, client_id, atendimento_id, mechanic_id')
      .order('created_at', { ascending: false })
      .limit(10);

    console.log('📋 Ordens encontradas:', orders?.length || 0, ordersError);

    if (ordersError || !orders || orders.length === 0) {
      return { success: false, message: `Nenhuma ordem de serviço encontrada` };
    }

    // Filtrar por telefone, nome ou apelido
    let targetOrder = null;
    
    for (const order of orders) {
      const orderPhoneDigits = (order.client_phone || '').replace(/\D/g, '');
      
      if (orderPhoneDigits === phoneDigits) {
        targetOrder = order;
        console.log('✅ Ordem encontrada por telefone:', order.id);
        break;
      }
      
      if (clientName && order.client_name?.toLowerCase().includes(clientName.toLowerCase())) {
        targetOrder = order;
        console.log('✅ Ordem encontrada por nome:', order.id);
        break;
      }
      
      if (apelido && order.client_apelido?.toLowerCase().includes(apelido.toLowerCase())) {
        targetOrder = order;
        console.log('✅ Ordem encontrada por apelido:', order.id);
        break;
      }
    }

    if (!targetOrder) {
      console.error('❌ Nenhuma ordem encontrada com os critérios:', { phone, clientName, apelido });
      return { success: false, message: `Nenhuma ordem encontrada` };
    }

    console.log('🎯 Ordem selecionada:', targetOrder);

    // Buscar ou criar satisfaction rating
    const { data: existingRating, error: ratingError } = await sb
      .from('satisfaction_ratings')
      .select('id, public_token, responded_at, atendimento_id, mechanic_id')
      .eq('order_id', targetOrder.id)
      .single();

    console.log('📊 Rating existente:', existingRating, ratingError);

    let token = existingRating?.public_token;
    let ratingId = existingRating?.id;

    if (!token) {
      // Criar novo registro de satisfação
      const newToken = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
      
      console.log('🆕 Criando novo rating com token:', newToken);
      
      const { data: created, error: createError } = await sb
        .from('satisfaction_ratings')
        .insert({
          order_id: targetOrder.id,
          client_id: targetOrder.client_id || null,
          atendimento_id: targetOrder.atendimento_id || null,
          mechanic_id: targetOrder.mechanic_id || null,
          public_token: newToken,
          status: 'pendente',
        })
        .select('id, public_token')
        .single();

      if (createError) {
        console.error('❌ Erro ao criar satisfação:', createError);
        return { 
          success: false, 
          message: `Erro ao gerar token: ${createError.message}`,
          debug: createError
        };
      }

      token = created?.public_token || newToken;
      ratingId = created?.id;
      console.log('✅ Rating criado:', { id: ratingId, token });
    } else if (ratingId) {
      // Garantir que avaliações de OS pronta sempre tenham atendente e mecânico preenchidos
      const needsSync =
        existingRating?.atendimento_id !== (targetOrder.atendimento_id || null) ||
        existingRating?.mechanic_id !== (targetOrder.mechanic_id || null);

      if (needsSync) {
        const { error: syncError } = await sb
          .from('satisfaction_ratings')
          .update({
            atendimento_id: targetOrder.atendimento_id || null,
            mechanic_id: targetOrder.mechanic_id || null,
          })
          .eq('id', ratingId);

        if (syncError) {
          console.warn('⚠️ Não foi possível sincronizar atendente/mecânico no rating:', syncError);
        } else {
          console.log('🔄 Rating sincronizado com atendimento e mecânico da OS');
        }
      }
    }

    // Se já foi respondido
    if (existingRating?.responded_at) {
      return { success: false, message: `Este cliente já respondeu a avaliação` };
    }

    // Montar URL de satisfação
    const baseUrl = window.location.origin;
    const satisfactionUrl = `${baseUrl}/avaliar/${token}`;

    console.log('🔗 URL gerada:', satisfactionUrl);

    // Mensagem de satisfação com link
    const SATISFACTION_MESSAGE = `Olá, ${targetOrder.client_name}! 👋

Aqui é da *Bandara Motos*.

Sua opinião é muito importante para melhorarmos sempre.
Pode avaliar seu atendimento em menos de 1 minuto? ⭐

${satisfactionUrl}

Obrigado pela confiança! 🏍️🔧`;

    console.log('📨 Enviando via WhatsApp para:', targetOrder.client_phone);
    
    // Enviar via WhatsApp
    await sendWhatsAppText({
      phone: targetOrder.client_phone,
      text: SATISFACTION_MESSAGE
    });

    console.log('✅ Enviado com sucesso!');

    return {
      success: true,
      message: `✅ Link de satisfação enviado para ${targetOrder.client_name}`,
      token,
      url: satisfactionUrl
    };
  } catch (error: Error | unknown) {
    console.error('❌ Erro em sendSatisfactionLinkToClient:', error);
    let message = 'Erro desconhecido';
    if (error instanceof Error) {
      message = error.message;
    }
    return { 
      success: false, 
      message: `❌ Erro: ${message}`,
      debug: error
    };
  }
}
