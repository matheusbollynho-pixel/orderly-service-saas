import { useEffect, useState } from 'react';
import { format, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAppointments, Appointment, SHIFT_LABELS } from '@/hooks/useAppointments';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CalendarDays, Wrench, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

const SESSION_KEY = 'agenda_alert_shown';

const SHIFT_ICONS: Record<string, string> = {
  manha: '☀️',
  tarde: '🌤️',
  dia_todo: '📅',
};

function ApptRow({ appt }: { appt: Appointment }) {
  return (
    <div className="flex items-start gap-2.5 py-2 border-b border-border/50 last:border-0">
      <span className="text-base mt-0.5">{SHIFT_ICONS[appt.shift]}</span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm truncate">{appt.client_name}</p>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
          <Wrench className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">{appt.equipment}</span>
          <span className="text-border">·</span>
          <span>{appt.service_description}</span>
        </div>
      </div>
      <span className="text-xs text-muted-foreground flex-shrink-0 mt-0.5">
        {SHIFT_LABELS[appt.shift]}
      </span>
    </div>
  );
}

interface Props {
  onGoToAgenda: () => void;
}

export function AgendaAlertModal({ onGoToAgenda }: Props) {
  const [open, setOpen] = useState(false);

  const today = format(new Date(), 'yyyy-MM-dd');
  const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');

  const { appointments, isLoading } = useAppointments(today, tomorrow);

  const todayAppts = appointments.filter(
    a => a.appointment_date === today && a.status !== 'cancelado' && a.status !== 'realizado'
  );
  const tomorrowAppts = appointments.filter(
    a => a.appointment_date === tomorrow && a.status !== 'cancelado' && a.status !== 'realizado'
  );

  useEffect(() => {
    if (isLoading) return;
    const hasAppts = todayAppts.length > 0 || tomorrowAppts.length > 0;
    const alreadyShown = sessionStorage.getItem(SESSION_KEY) === today;
    if (hasAppts && !alreadyShown) {
      setOpen(true);
      sessionStorage.setItem(SESSION_KEY, today);
    }
  }, [isLoading, todayAppts.length, tomorrowAppts.length, today]);

  const handleClose = () => setOpen(false);

  const handleGoToAgenda = () => {
    setOpen(false);
    onGoToAgenda();
  };

  const todayLabel = format(new Date(), "EEEE, dd/MM", { locale: ptBR });
  const tomorrowLabel = format(addDays(new Date(), 1), "EEEE, dd/MM", { locale: ptBR });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-5 w-5 text-primary" />
            Agenda do dia
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Hoje */}
          {todayAppts.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold uppercase tracking-wide text-primary capitalize">
                  Hoje — {todayLabel}
                </span>
                <span className="text-[10px] font-bold bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full">
                  {todayAppts.length}
                </span>
              </div>
              <div className="rounded-lg border border-border bg-muted/20 px-3">
                {todayAppts.map(a => <ApptRow key={a.id} appt={a} />)}
              </div>
            </div>
          )}

          {/* Amanhã */}
          {tomorrowAppts.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground capitalize">
                  Amanhã — {tomorrowLabel}
                </span>
                <span className="text-[10px] font-bold bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full border">
                  {tomorrowAppts.length}
                </span>
              </div>
              <div className="rounded-lg border border-border bg-muted/20 px-3">
                {tomorrowAppts.map(a => <ApptRow key={a.id} appt={a} />)}
              </div>
            </div>
          )}

          {todayAppts.length === 0 && tomorrowAppts.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhum agendamento para hoje ou amanhã.
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={handleClose} className="flex-1">
            Fechar
          </Button>
          <Button type="button" onClick={handleGoToAgenda} className="flex-1 gap-1.5">
            <CalendarDays className="h-4 w-4" />
            Ver Agenda
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
