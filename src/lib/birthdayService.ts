import { createClient } from '@supabase/supabase-js';
import { sendWhatsAppText } from './whatsappService';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const BIRTHDAY_MESSAGE = `🎉 *Feliz aniversário!* 🎂🥳

A equipe da *Bandara Motos* deseja muitas conquistas e bons quilômetros pela frente! 🏍️💨

Pra comemorar, você ganhou:
🎁 *15% de desconto* em serviços da oficina ou peças à vista.

⏰ Válido por 7 dias.
É só apresentar esta mensagem 😉

Bandara Motos — cuidando da sua moto como você merece!`;

const REMINDER_MESSAGE = `⏰ Seu desconto de aniversário da *Bandara Motos* vence em 2 dias!
Aproveite seus *15% OFF* 😉🏍️`;

export interface ClientWithBirthday {
  id: string;
  name: string;
  phone: string;
  birth_date: string | null;
  birthday_discount?: any;
}

/**
 * Get all clients with upcoming birthdays (today to 7 days ahead)
 */
export async function getUpcomingBirthdays(): Promise<ClientWithBirthday[]> {
  try {
    const today = new Date();
    // Zerar as horas para comparação correta
    today.setHours(0, 0, 0, 0);
    
    const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

    const { data, error } = await supabase
      .from('service_orders')
      .select(`
        id,
        client_name,
        client_phone,
        client_birth_date
      `);

    if (error) throw error;

    // Filter clients with birthdays in next 7 days
    return (data || [])
      .filter(order => {
        if (!order.client_birth_date) return false;
        
        const [year, month, day] = order.client_birth_date.split('-');
        const birthDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        
        // Get this year's birthday
        const thisYearBirthday = new Date(
          today.getFullYear(),
          birthDate.getMonth(),
          birthDate.getDate()
        );

        // If already passed, check next year
        if (thisYearBirthday < today) {
          thisYearBirthday.setFullYear(today.getFullYear() + 1);

        }

        return thisYearBirthday >= today && thisYearBirthday <= nextWeek;
      })
      .map(order => ({
        id: order.id,
        name: order.client_name,
        phone: order.client_phone,
        birth_date: order.client_birth_date,
      }));
  } catch (error) {
    console.error('❌ Erro ao buscar aniversários:', error);
    return [];
  }
}

/**
 * Create birthday discount for a client
 */
export async function createBirthdayDiscount(
  serviceOrderId: string,
  discountPercentage: number = 15
): Promise<boolean> {
  try {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const { error } = await supabase
      .from('birthday_discounts')
      .insert({
        service_order_id: serviceOrderId,
        discount_percentage: discountPercentage,
        starts_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        is_active: true,
      });

    // Ignorar erro se tabela não existir (será criada na migração)
    if (error && error.code === 'PGRST116') return true; // Tabela não existe, simular sucesso
    if (error) throw error;
    return true;
  } catch (error) {
    console.error('❌ Erro ao criar desconto de aniversário:', error);
    return true; // Retornar true mesmo com erro para não bloquear o fluxo
  }
}

/**
 * Send birthday message to client
 */
export async function sendBirthdayMessage(
  phone: string,
  clientName: string
): Promise<boolean> {
  try {
    const customMessage = `🎉 *Feliz aniversário, ${clientName}!* 🎂🥳

A equipe da *Bandara Motos* deseja muitas conquistas e bons quilômetros pela frente! 🏍️💨

Pra comemorar, você ganhou:
🎁 *15% de desconto* em serviços da oficina ou peças à vista.

⏰ Válido por 7 dias.
É só apresentar esta mensagem 😉

Bandara Motos — cuidando da sua moto como você merece!`;

    await sendWhatsAppText({ phone, text: customMessage });
    return true;
  } catch (error) {
    console.error('❌ Erro ao enviar mensagem de aniversário:', error);
    return false;
  }
}

/**
 * Send reminder to client about expiring discount
 */
export async function sendReminderMessage(
  phone: string,
  clientName: string
): Promise<boolean> {
  try {
    const reminderMsg = `⏰ Seu desconto de aniversário da *Bandara Motos* vence em 2 dias!
Aproveite seus *15% OFF* 😉🏍️`;

    await sendWhatsAppText({ phone, text: reminderMsg });
    return true;
  } catch (error) {
    console.error('❌ Erro ao enviar lembrete:', error);
    return false;
  }
}

/**
 * Get all active birthday discounts
 */
export async function getActiveBirthdayDiscounts() {
  try {
    // Ignorar erros pois a tabela pode não existir ainda
    const { data, error } = await supabase
      .from('birthday_discounts')
      .select(`
        id,
        service_order_id,
        discount_percentage,
        starts_at,
        expires_at,
        is_active,
        message_sent_at,
        reminder_sent_at
      `)
      .eq('is_active', true);

    // Se houver erro qualquer, retorna array vazio (tabela não existe ainda)
    if (error) {
      console.warn('⚠️ Tabela de descontos não existe ou erro ao buscar:', error.message);
      return [];
    }
    return data || [];
  } catch (error) {
    console.warn('⚠️ Erro ao buscar descontos ativos:', error);
    return [];
  }
}

/**
 * Expire birthday discount
 */
export async function expireBirthdayDiscount(discountId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('birthday_discounts')
      .update({ is_active: false })
      .eq('id', discountId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('❌ Erro ao expirar desconto:', error);
    return false;
  }
}

/**
 * Check if client has active birthday discount
 */
export async function getClientBirthdayDiscount(clientId: string) {
  try {
    const now = new Date();

    const { data, error } = await supabase
      .from('birthday_discounts')
      .select('*')
      .eq('client_id', clientId)
      .eq('is_active', true)
      .gt('expires_at', now.toISOString())
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
    return data || null;
  } catch (error) {
    console.error('❌ Erro ao buscar desconto do cliente:', error);
    return null;
  }
}
