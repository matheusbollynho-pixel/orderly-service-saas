import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useStore } from '@/contexts/StoreContext';

export type AppointmentShift = 'manha' | 'tarde' | 'dia_todo';
export type AppointmentStatus = 'agendado' | 'confirmado' | 'cancelado' | 'realizado';

export interface Appointment {
  id: string;
  client_name: string;
  client_phone: string;
  client_id?: string | null;
  equipment: string;
  service_description: string;
  appointment_date: string; // 'YYYY-MM-DD'
  shift: AppointmentShift;
  status: AppointmentStatus;
  mechanic_id?: string | null;
  service_order_id?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export type CreateAppointmentPayload = Omit<Appointment, 'id' | 'created_at' | 'updated_at'>;

export const SHIFT_LABELS: Record<AppointmentShift, string> = {
  manha: 'Manhã',
  tarde: 'Tarde',
  dia_todo: 'Dia todo',
};

export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  agendado: 'Agendado',
  confirmado: 'Confirmado',
  cancelado: 'Cancelado',
  realizado: 'Realizado',
};

export const STATUS_COLORS: Record<AppointmentStatus, string> = {
  agendado: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  confirmado: 'bg-green-500/20 text-green-400 border-green-500/30',
  cancelado: 'bg-red-500/20 text-red-400 border-red-500/30',
  realizado: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

export function useAppointments(startDate?: string, endDate?: string) {
  const queryClient = useQueryClient();
  const { storeId } = useStore();

  const appointmentsQuery = useQuery({
    queryKey: ['appointments', startDate, endDate],
    queryFn: async () => {
      let query = supabase
        .from('appointments')
        .select('*')
        .order('appointment_date', { ascending: true })
        .order('shift', { ascending: true });

      if (startDate) query = query.gte('appointment_date', startDate);
      if (endDate) query = query.lte('appointment_date', endDate);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Appointment[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (payload: CreateAppointmentPayload) => {
      const { data, error } = await supabase
        .from('appointments')
        .insert({ ...payload, store_id: storeId! })
        .select()
        .single();
      if (error) throw error;
      return data as Appointment;
    },
    onSuccess: (appt: Appointment) => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      toast.success('Agendamento criado!');
      // Enviar confirmação via WhatsApp se tiver telefone
      if (appt.client_phone) {
        supabase.functions.invoke('send-appointment-confirmation', {
          body: {
            client_name: appt.client_name,
            client_phone: appt.client_phone,
            appointment_date: appt.appointment_date,
            shift: appt.shift,
            equipment: appt.equipment,
            service_description: appt.service_description,
          },
        }).then(({ error }) => {
          if (error) console.error('Erro ao enviar confirmação WhatsApp:', error);
        });
      }
    },
    onError: (err: Error) => {
      toast.error(`Erro ao criar agendamento: ${err.message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Appointment> & { id: string }) => {
      const { data, error } = await supabase
        .from('appointments')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as Appointment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
    },
    onError: (err: Error) => {
      toast.error(`Erro ao atualizar agendamento: ${err.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('appointments').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      toast.success('Agendamento removido.');
    },
    onError: (err: Error) => {
      toast.error(`Erro ao remover agendamento: ${err.message}`);
    },
  });

  return {
    appointments: appointmentsQuery.data ?? [],
    isLoading: appointmentsQuery.isLoading,
    createAppointment: createMutation.mutate,
    updateAppointment: updateMutation.mutate,
    deleteAppointment: deleteMutation.mutate,
    isCreating: createMutation.isPending,
  };
}
