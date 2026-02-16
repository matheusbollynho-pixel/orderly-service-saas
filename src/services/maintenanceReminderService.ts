import { supabase } from '@/integrations/supabase/client';

// Use untyped client for new tables until Database types are updated
const sb = supabase as any;

export interface MaintenanceKeyword {
  id: string;
  keyword: string;
  description: string;
  reminder_days: number;
  reminder_message: string;
  enabled: boolean;
}

export interface MaintenanceReminder {
  id: string;
  order_id: string;
  client_id: string;
  keyword_id: string;
  service_date: string;
  reminder_due_date: string;
  reminder_sent_at: string | null;
  client_phone: string;
}

/**
 * Get all enabled maintenance keywords
 */
export async function getMaintenanceKeywords(): Promise<MaintenanceKeyword[]> {
  try {
    const { data, error } = await sb
      .from('maintenance_keywords')
      .select('*')
      .eq('enabled', true)
      .order('keyword');

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Erro ao buscar keywords:', error);
    return [];
  }
}

/**
 * Check if a text contains any maintenance keyword
 */
export function findKeywordInText(
  text: string,
  keywords: MaintenanceKeyword[]
): MaintenanceKeyword | null {
  const lowerText = text.toLowerCase();

  for (const keyword of keywords) {
    if (lowerText.includes(keyword.keyword.toLowerCase())) {
      return keyword;
    }
  }

  return null;
}

/**
 * Create a maintenance reminder for a service order
 */
export async function createMaintenanceReminder(
  orderId: string,
  clientId: string | null,
  clientPhone: string,
  keywordId: string,
  serviceDate: Date
): Promise<MaintenanceReminder | null> {
  try {
    const startOfDay = new Date(serviceDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(serviceDate);
    endOfDay.setHours(23, 59, 59, 999);

    const { data: existingReminder, error: existingError } = await sb
      .from('maintenance_reminders')
      .select('*')
      .eq('order_id', orderId)
      .eq('keyword_id', keywordId)
      .maybeSingle();

    if (!existingError && existingReminder) {
      return existingReminder;
    }

    // Get keyword to calculate reminder date
    const { data: keyword, error: keywordError } = await sb
      .from('maintenance_keywords')
      .select('reminder_days, reminder_message, keyword')
      .eq('id', keywordId)
      .single();

    if (keywordError) throw keywordError;

    const isRevisao = (keyword.keyword || '').toLowerCase() === 'revisao';

    // Se já existe revisão no mesmo dia/cliente, não cria outros lembretes
    if (!isRevisao) {
      let checkQuery = sb
        .from('maintenance_reminders')
        .select('id, keyword:maintenance_keywords(keyword)')
        .gte('service_date', startOfDay.toISOString())
        .lte('service_date', endOfDay.toISOString());

      if (clientId) {
        checkQuery = checkQuery.eq('client_id', clientId);
      } else {
        checkQuery = checkQuery.eq('client_phone', clientPhone);
      }

      const { data: sameDay, error: sameDayError } = await checkQuery;
      if (sameDayError) throw sameDayError;

      const hasRevisao = (sameDay || []).some((r: any) => (r.keyword?.keyword || '').toLowerCase() === 'revisao');
      if (hasRevisao) {
        return null;
      }
    }

    // Se o lembrete é revisão, remove outros lembretes do mesmo dia/cliente
    if (isRevisao) {
      let deleteQuery = sb
        .from('maintenance_reminders')
        .delete()
        .gte('service_date', startOfDay.toISOString())
        .lte('service_date', endOfDay.toISOString());

      if (clientId) {
        deleteQuery = deleteQuery.eq('client_id', clientId);
      } else {
        deleteQuery = deleteQuery.eq('client_phone', clientPhone);
      }

      const { error: deleteError } = await deleteQuery
        .neq('keyword_id', keywordId);

      if (deleteError) throw deleteError;
    }

    // Calculate reminder due date
    const reminderDueDate = new Date(serviceDate);
    reminderDueDate.setDate(reminderDueDate.getDate() + keyword.reminder_days);

    const { data, error } = await sb
      .from('maintenance_reminders')
      .insert({
        order_id: orderId,
        client_id: clientId,
        keyword_id: keywordId,
        service_date: serviceDate.toISOString(),
        reminder_due_date: reminderDueDate.toISOString(),
        client_phone: clientPhone,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Erro ao criar lembrete:', error);
    return null;
  }
}

/**
 * Get pending reminders for a client
 */
export async function getPendingRemindersForClient(
  clientId: string
): Promise<MaintenanceReminder[]> {
  try {
    const { data, error } = await sb
      .from('maintenance_reminders')
      .select('*')
      .eq('client_id', clientId)
      .is('reminder_sent_at', null)
      .lte('reminder_due_date', new Date().toISOString())
      .order('reminder_due_date');

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Erro ao buscar lembretes:', error);
    return [];
  }
}

/**
 * Get all reminders (sent and pending) for a client
 */
export async function getAllRemindersForClient(
  clientId: string
): Promise<MaintenanceReminder[]> {
  try {
    const { data, error } = await sb
      .from('maintenance_reminders')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Erro ao buscar lembretes:', error);
    return [];
  }
}

/**
 * Get all reminders for a service order
 */
export async function getRemindersForOrder(
  orderId: string
): Promise<MaintenanceReminder[]> {
  try {
    const { data, error } = await sb
      .from('maintenance_reminders')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Erro ao buscar lembretes:', error);
    return [];
  }
}

/**
 * Update maintenance keyword
 */
export async function updateMaintenanceKeyword(
  keywordId: string,
  updates: Partial<MaintenanceKeyword>
): Promise<MaintenanceKeyword | null> {
  try {
    const { data, error } = await sb
      .from('maintenance_keywords')
      .update(updates)
      .eq('id', keywordId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Erro ao atualizar keyword:', error);
    return null;
  }
}

/**
 * Create new maintenance keyword
 */
export async function createMaintenanceKeyword(
  keyword: MaintenanceKeyword
): Promise<MaintenanceKeyword | null> {
  try {
    const { data, error } = await sb
      .from('maintenance_keywords')
      .insert(keyword)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Erro ao criar keyword:', error);
    return null;
  }
}
