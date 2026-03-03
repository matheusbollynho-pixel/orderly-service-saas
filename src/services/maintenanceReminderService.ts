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

export interface MaintenanceReminderWithDetails extends MaintenanceReminder {
  keyword?: {
    keyword: string;
    reminder_days: number;
  } | null;
  order?: {
    client_name: string;
    client_phone: string;
    client?: {
      autoriza_lembretes: boolean | null;
    } | null;
  } | null;
}

/**
 * Get all maintenance keywords (enabled and disabled)
 */
export async function getMaintenanceKeywords(): Promise<MaintenanceKeyword[]> {
  try {
    console.log('🔍 Buscando TODAS as keywords (enabled e disabled)...');
    const { data, error } = await sb
      .from('maintenance_keywords')
      .select('*')
      .order('keyword');

    if (error) {
      console.error('❌ Erro ao buscar keywords:', error);
      throw error;
    }
    
    console.log('📋 Keywords encontradas:', data?.length || 0);
    return data || [];
  } catch (error) {
    console.error('❌ Erro ao buscar keywords:', error);
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
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

  const normalizedText = normalize(text);

  for (const keyword of keywords) {
    if (normalizedText.includes(normalize(keyword.keyword))) {
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
 * Get all pending maintenance reminders with details
 */
export async function getPendingMaintenanceReminders(): Promise<MaintenanceReminderWithDetails[]> {
  try {
    const { data, error } = await sb
      .from('maintenance_reminders')
      .select(
        `
        id,
        order_id,
        client_id,
        keyword_id,
        service_date,
        reminder_due_date,
        reminder_sent_at,
        client_phone,
        keyword:maintenance_keywords(keyword, reminder_days),
        order:service_orders(client_name, client_phone, client:clients(autoriza_lembretes))
        `
      )
      .is('reminder_sent_at', null)
      .order('reminder_due_date', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Erro ao buscar lembretes pendentes:', error);
    return [];
  }
}

/**
 * Get all maintenance reminders (pending and sent) with details
 */
export async function getAllMaintenanceReminders(): Promise<MaintenanceReminderWithDetails[]> {
  try {
    const { data, error } = await sb
      .from('maintenance_reminders')
      .select(
        `
        id,
        order_id,
        client_id,
        keyword_id,
        service_date,
        reminder_due_date,
        reminder_sent_at,
        client_phone,
        keyword:maintenance_keywords(keyword, reminder_days),
        order:service_orders(client_name, client_phone, client:clients(autoriza_lembretes))
        `
      )
      .order('reminder_due_date', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Erro ao buscar todos os lembretes:', error);
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

/**
 * Delete maintenance keyword
 */
export async function deleteMaintenanceKeyword(
  keywordId: string
): Promise<boolean> {
  try {
    console.log('🗑️ Tentando deletar keyword:', keywordId);
    
    // Verificar se existe antes
    const { data: before } = await sb
      .from('maintenance_keywords')
      .select('id, keyword')
      .eq('id', keywordId)
      .single();
    
    console.log('📋 Keyword ANTES do delete:', before);
    
    const { data, error } = await sb
      .from('maintenance_keywords')
      .delete()
      .eq('id', keywordId)
      .select();

    if (error) {
      console.error('❌ Erro ao deletar keyword:', error);
      throw error;
    }
    
    console.log('✅ Keyword deletada com sucesso:', data);
    
    // Verificar se foi realmente deletada
    const { data: after } = await sb
      .from('maintenance_keywords')
      .select('id')
      .eq('id', keywordId)
      .maybeSingle();
    
    if (after) {
      console.error('⚠️ ERRO: Keyword ainda existe no banco após delete!', after);
      return false;
    }
    
    console.log('✅ Confirmado: Keyword não existe mais no banco');
    return true;
  } catch (error) {
    console.error('❌ Erro ao deletar keyword:', error);
    return false;
  }
}

/**
 * Cancel pending reminders for a client and keyword (for rescheduling)
 * Used when customer returns before the scheduled maintenance reminder date
 */
export async function cancelPendingRemindersForKeyword(
  clientId: string | null,
  clientPhone: string,
  keywordId: string,
  reason: string = 'Cliente retornou antes do prazo - remarcação de lembrete'
): Promise<number> {
  try {
    // Get pending reminders to track cancellation
    let selectQuery = sb
      .from('maintenance_reminders')
      .select('id, reminder_due_date, service_date')
      .eq('keyword_id', keywordId)
      .is('reminder_sent_at', null);

    if (clientId) {
      selectQuery = selectQuery.eq('client_id', clientId);
    } else {
      selectQuery = selectQuery.eq('client_phone', clientPhone);
    }

    const { data: remindersToCancel, error: selectError } = await selectQuery;
    if (selectError) throw selectError;

    if (!remindersToCancel || remindersToCancel.length === 0) {
      return 0;
    }

    // Delete the pending reminders
    let deleteQuery = sb
      .from('maintenance_reminders')
      .delete()
      .eq('keyword_id', keywordId)
      .is('reminder_sent_at', null);

    if (clientId) {
      deleteQuery = deleteQuery.eq('client_id', clientId);
    } else {
      deleteQuery = deleteQuery.eq('client_phone', clientPhone);
    }

    const { error: deleteError } = await deleteQuery;
    if (deleteError) throw deleteError;

    // Log the cancellation if reminder_history table exists
    for (const reminder of remindersToCancel) {
      try {
        await sb
          .from('maintenance_reminder_history')
          .insert({
            client_id: clientId,
            client_phone: clientPhone,
            keyword_id: keywordId,
            action: 'cancelled',
            reason: reason,
            original_due_date: reminder.reminder_due_date,
            original_service_date: reminder.service_date,
          });
      } catch (historyError) {
        // History table might not exist yet, that's ok
        console.debug('History not recorded:', historyError);
      }
    }

    console.log(`✅ ${remindersToCancel.length} lembrete(s) cancelado(s) para reprogramação`);
    return remindersToCancel.length;
  } catch (error) {
    console.error('Erro ao cancelar lembretes:', error);
    return 0;
  }
}

/**
 * Reschedule maintenance reminder when customer returns early
 * This function:
 * 1. Cancels existing pending reminders for the same keyword
 * 2. Creates a new reminder based on the new service date
 */
export async function rescheduleMaintenanceReminder(
  orderId: string,
  clientId: string | null,
  clientPhone: string,
  keywordId: string,
  newServiceDate: Date
): Promise<{ cancelled: number; created: MaintenanceReminder | null }> {
  try {
    // Step 1: Cancel existing pending reminders
    const cancelledCount = await cancelPendingRemindersForKeyword(
      clientId,
      clientPhone,
      keywordId,
      'Cliente retornou para serviço - remarcação automática'
    );

    // Step 2: Create new reminder with the new service date
    const newReminder = await createMaintenanceReminder(
      orderId,
      clientId,
      clientPhone,
      keywordId,
      newServiceDate
    );

    console.log(`📅 Lembrete reprogramado: ${cancelledCount} cancelado(s), 1 novo criado`);

    return {
      cancelled: cancelledCount,
      created: newReminder,
    };
  } catch (error) {
    console.error('Erro ao reprogramar lembrete:', error);
    return {
      cancelled: 0,
      created: null,
    };
  }
}

/**
 * Get cancellation history for a client (if history table exists)
 */
export async function getReminderCancellationHistory(
  clientId: string | null,
  clientPhone: string
): Promise<any[]> {
  try {
    let query = sb
      .from('maintenance_reminder_history')
      .select('*')
      .eq('action', 'cancelled');

    if (clientId) {
      query = query.eq('client_id', clientId);
    } else {
      query = query.eq('client_phone', clientPhone);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.debug('Histórico não disponível:', error);
    return [];
  }
}
