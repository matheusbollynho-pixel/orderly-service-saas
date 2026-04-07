import { useState, useMemo } from 'react';
import {
  startOfWeek, endOfWeek, addWeeks, subWeeks,
  eachDayOfInterval, format, isToday, parseISO, isSameDay,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  useAppointments,
  Appointment, AppointmentShift, AppointmentStatus,
  SHIFT_LABELS, STATUS_LABELS, STATUS_COLORS,
  CreateAppointmentPayload,
} from '@/hooks/useAppointments';
import { useClients } from '@/hooks/useClients';
import { useMechanics } from '@/hooks/useMechanics';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { ChevronLeft, ChevronRight, Plus, Phone, Wrench, Trash2, CalendarDays, LayoutDashboard, Clock3, Loader2, CheckCircle2, ClipboardList, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { VEHICLE_CAP } from '@/lib/vehicleLabel';

const SHIFTS: AppointmentShift[] = ['manha', 'tarde'];
const SHIFT_ICONS: Record<AppointmentShift, string> = {
  manha: '☀️',
  tarde: '🌤️',
  dia_todo: '📅',
};

// Seg a Sab
function getWeekDays(refDate: Date) {
  const start = startOfWeek(refDate, { weekStartsOn: 1 }); // segunda
  const end = endOfWeek(refDate, { weekStartsOn: 1 });
  return eachDayOfInterval({ start, end }).slice(0, 6); // seg-sab
}

interface FormState {
  client_name: string;
  client_phone: string;
  client_id: string;
  equipment: string;
  service_description: string;
  appointment_date: string;
  shift: AppointmentShift;
  mechanic_id: string;
  notes: string;
  status: AppointmentStatus;
}

const EMPTY_FORM: FormState = {
  client_name: '',
  client_phone: '',
  client_id: '',
  equipment: '',
  service_description: '',
  appointment_date: '',
  shift: 'manha',
  mechanic_id: '',
  notes: '',
  status: 'agendado',
};

function AppointmentCard({
  appt,
  onEdit,
  onDelete,
  onStatusChange,
}: {
  appt: Appointment;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (status: AppointmentStatus) => void;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border p-2.5 space-y-1.5 cursor-pointer hover:opacity-90 transition-opacity',
        appt.status === 'cancelado' && 'opacity-50',
      )}
      onClick={onEdit}
    >
      <div className="flex items-start justify-between gap-1">
        <p className="font-semibold text-xs leading-tight truncate flex-1">{appt.client_name}</p>
        <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full border flex-shrink-0', STATUS_COLORS[appt.status])}>
          {STATUS_LABELS[appt.status]}
        </span>
      </div>
      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <Wrench className="h-3 w-3 flex-shrink-0" />
        <span className="truncate">{appt.equipment}</span>
      </div>
      <p className="text-[11px] text-muted-foreground truncate">{appt.service_description}</p>
      {appt.client_phone && (
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Phone className="h-3 w-3 flex-shrink-0" />
          <span>{appt.client_phone}</span>
        </div>
      )}
    </div>
  );
}

interface AgendaPageProps {
  onConvertToOS?: (appt: Appointment) => void;
}

export default function AgendaPage({ onConvertToOS }: AgendaPageProps = {}) {
  const [currentWeekRef, setCurrentWeekRef] = useState(new Date());
  const weekDays = useMemo(() => getWeekDays(currentWeekRef), [currentWeekRef]);

  const startDate = format(weekDays[0], 'yyyy-MM-dd');
  const endDate = format(weekDays[weekDays.length - 1], 'yyyy-MM-dd');

  const { appointments, isLoading, createAppointment, updateAppointment, deleteAppointment, isCreating } = useAppointments(startDate, endDate);
  // Todos os agendamentos — para o dashboard
  const { appointments: allAppointments } = useAppointments();
  const { clients, searchClientByPhone } = useClients();
  const { mechanics } = useMechanics();

  const [pageView, setPageView] = useState<'calendario' | 'dashboard'>('dashboard');
  const [dashFilter, setDashFilter] = useState<AppointmentStatus | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingAppt, setEditingAppt] = useState<Appointment | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [clientSearch, setClientSearch] = useState('');

  const filteredClients = useMemo(() => {
    if (!clientSearch) return [];
    const q = clientSearch.toLowerCase();
    return clients.filter(c =>
      c.name.toLowerCase().includes(q) || (c.phone ?? '').includes(q)
    ).slice(0, 5);
  }, [clients, clientSearch]);

  function openNewForm(date: Date, shift: AppointmentShift) {
    setEditingAppt(null);
    setForm({ ...EMPTY_FORM, appointment_date: format(date, 'yyyy-MM-dd'), shift });
    setClientSearch('');
    setShowForm(true);
  }

  function openEditForm(appt: Appointment) {
    setEditingAppt(appt);
    setForm({
      client_name: appt.client_name,
      client_phone: appt.client_phone,
      client_id: appt.client_id ?? '',
      equipment: appt.equipment,
      service_description: appt.service_description,
      appointment_date: appt.appointment_date,
      shift: appt.shift,
      mechanic_id: appt.mechanic_id ?? '',
      notes: appt.notes ?? '',
      status: appt.status,
    });
    setClientSearch(appt.client_name);
    setShowForm(true);
  }

  function handleSave() {
    if (!form.client_name || !form.equipment || !form.service_description || !form.appointment_date) {
      return;
    }

    const payload: CreateAppointmentPayload = {
      client_name: form.client_name,
      client_phone: form.client_phone,
      client_id: form.client_id || null,
      equipment: form.equipment,
      service_description: form.service_description,
      appointment_date: form.appointment_date,
      shift: form.shift,
      status: form.status,
      mechanic_id: form.mechanic_id || null,
      notes: form.notes || null,
    };

    if (editingAppt) {
      updateAppointment({ id: editingAppt.id, ...payload });
    } else {
      createAppointment(payload);
    }
    setShowForm(false);
  }

  function getAppts(day: Date, shift: AppointmentShift) {
    return appointments.filter(a =>
      isSameDay(parseISO(a.appointment_date), day) &&
      (a.shift === shift || a.shift === 'dia_todo')
    );
  }

  const weekLabel = `${format(weekDays[0], "d 'de' MMM", { locale: ptBR })} – ${format(weekDays[weekDays.length - 1], "d 'de' MMM", { locale: ptBR })}`;

  // ── Dados para o dashboard ────────────────────────────────
  const dashStats = useMemo(() => {
    const naoCancel = allAppointments.filter(a => a.status !== 'cancelado');
    return {
      total: naoCancel.length,
      agendado: allAppointments.filter(a => a.status === 'agendado').length,
      confirmado: allAppointments.filter(a => a.status === 'confirmado').length,
      realizado: allAppointments.filter(a => a.status === 'realizado').length,
      cancelado: allAppointments.filter(a => a.status === 'cancelado').length,
    };
  }, [allAppointments]);

  const dashList = useMemo(() => {
    const list = dashFilter
      ? allAppointments.filter(a => a.status === dashFilter)
      : allAppointments.filter(a => a.status !== 'cancelado');
    return [...list].sort((a, b) => b.appointment_date.localeCompare(a.appointment_date));
  }, [allAppointments, dashFilter]);

  return (
    <div className="pb-32">
      {/* Header com toggle de view */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold">Agenda</h1>
          <div className="flex items-center gap-1 bg-muted/40 rounded-lg p-1">
            <Button
              type="button"
              variant={pageView === 'dashboard' ? 'default' : 'ghost'}
              size="sm"
              className="h-7 px-2.5 text-xs gap-1.5"
              onClick={() => setPageView('dashboard')}
            >
              <LayoutDashboard className="h-3.5 w-3.5" />
              Resumo
            </Button>
            <Button
              type="button"
              variant={pageView === 'calendario' ? 'default' : 'ghost'}
              size="sm"
              className="h-7 px-2.5 text-xs gap-1.5"
              onClick={() => setPageView('calendario')}
            >
              <CalendarDays className="h-3.5 w-3.5" />
              Calendário
            </Button>
          </div>
        </div>

        {/* Sub-header conforme a view */}
        {pageView === 'calendario' && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground font-medium">{weekLabel}</p>
            <div className="flex items-center gap-1">
              <Button type="button" variant="outline" size="icon" className="h-7 w-7"
                onClick={() => setCurrentWeekRef(w => subWeeks(w, 1))}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="sm" className="text-xs px-2 h-7"
                onClick={() => setCurrentWeekRef(new Date())}>
                Hoje
              </Button>
              <Button type="button" variant="outline" size="icon" className="h-7 w-7"
                onClick={() => setCurrentWeekRef(w => addWeeks(w, 1))}>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── VIEW DASHBOARD ──────────────────────────────────── */}
      {pageView === 'dashboard' && (
        <div className="px-4 space-y-4">
          {/* Cards de métricas */}
          <div className="glass-card-elevated bg-neutral-900 rounded-[8px] p-4">
            <div className="grid grid-cols-2 gap-3">
              {/* Total */}
              <button type="button" className="text-left transition-transform hover:scale-[1.01]"
                onClick={() => setDashFilter(null)}>
                <div className={cn('rounded-xl border p-4 bg-card transition-all',
                  dashFilter === null ? 'border-primary/70 shadow-[0_0_0_1px_rgba(193,39,45,0.25)]' : 'border-neutral-800')}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Total</span>
                    <ClipboardList className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <span className="text-3xl font-black tracking-tight">{dashStats.total}</span>
                </div>
              </button>

              {/* Agendados */}
              <button type="button" className="text-left transition-transform hover:scale-[1.01]"
                onClick={() => setDashFilter('agendado')}>
                <div className={cn('rounded-xl border p-4 bg-card transition-all',
                  dashFilter === 'agendado' ? 'border-primary/70 shadow-[0_0_0_1px_rgba(193,39,45,0.25)]' : 'border-neutral-800')}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Agendados</span>
                    <Clock3 className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <span className="text-3xl font-black tracking-tight">{dashStats.agendado}</span>
                </div>
              </button>

              {/* Confirmados */}
              <button type="button" className="text-left transition-transform hover:scale-[1.01]"
                onClick={() => setDashFilter('confirmado')}>
                <div className={cn('rounded-xl border p-4 bg-card transition-all',
                  dashFilter === 'confirmado' ? 'border-primary/70 shadow-[0_0_0_1px_rgba(193,39,45,0.25)]' : 'border-neutral-800')}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Confirmados</span>
                    <Loader2 className="h-4 w-4 text-[#C1272D] animate-spin" />
                  </div>
                  <span className="text-3xl font-black tracking-tight">{dashStats.confirmado}</span>
                </div>
              </button>

              {/* Realizados */}
              <button type="button" className="text-left transition-transform hover:scale-[1.01]"
                onClick={() => setDashFilter('realizado')}>
                <div className={cn('rounded-xl border p-4 bg-card transition-all',
                  dashFilter === 'realizado' ? 'border-primary/70 shadow-[0_0_0_1px_rgba(193,39,45,0.25)]' : 'border-neutral-800')}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Realizados</span>
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  </div>
                  <span className="text-3xl font-black tracking-tight">{dashStats.realizado}</span>
                </div>
              </button>
            </div>
          </div>

          {/* Lista filtrada */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {dashFilter ? STATUS_LABELS[dashFilter] : 'Todos (exceto cancelados)'}
              {' '}— {dashList.length} agendamento{dashList.length !== 1 ? 's' : ''}
            </p>

            {dashList.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm">
                <Calendar className="h-10 w-10 mx-auto mb-2 opacity-30" />
                Nenhum agendamento
              </div>
            ) : (
              dashList.map(appt => (
                <div
                  key={appt.id}
                  className="rounded-xl border border-border bg-card p-3 cursor-pointer hover:border-primary/30 transition-colors"
                  onClick={() => openEditForm(appt)}
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{appt.client_name}</p>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                        <Wrench className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">{appt.equipment}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full border', STATUS_COLORS[appt.status])}>
                        {STATUS_LABELS[appt.status]}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {format(parseISO(appt.appointment_date), "dd/MM/yy", { locale: ptBR })}
                        {' · '}{SHIFT_LABELS[appt.shift]}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{appt.service_description}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── VIEW CALENDÁRIO ──────────────────────────────────── */}
      {pageView === 'calendario' && (
        <>
      {/* Grade semanal */}
      {isLoading ? (
        <div className="px-4 text-center py-10 text-muted-foreground text-sm">Carregando...</div>
      ) : (
        <div className="px-4 space-y-3">
          {weekDays.map(day => {
            const isHoje = isToday(day);
            const totalDia = appointments.filter(a => isSameDay(parseISO(a.appointment_date), day) && a.status !== 'cancelado').length;

            return (
              <div key={day.toISOString()} className={cn(
                'rounded-xl border overflow-hidden',
                isHoje ? 'border-primary/50' : 'border-border'
              )}>
                {/* Cabeçalho do dia */}
                <div className={cn(
                  'flex items-center justify-between px-3 py-2',
                  isHoje ? 'bg-primary/10' : 'bg-muted/30'
                )}>
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      'font-bold text-sm capitalize',
                      isHoje && 'text-primary'
                    )}>
                      {format(day, "EEEE, dd/MM", { locale: ptBR })}
                    </span>
                    {isHoje && (
                      <span className="text-[10px] font-bold uppercase bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full">
                        Hoje
                      </span>
                    )}
                  </div>
                  {totalDia > 0 && (
                    <span className="text-xs text-muted-foreground font-medium">
                      {totalDia} agend.
                    </span>
                  )}
                </div>

                {/* Turnos */}
                <div className="divide-y divide-border/50">
                  {SHIFTS.map(shift => {
                    const appts = getAppts(day, shift);
                    return (
                      <div key={shift} className="p-2.5">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                            {SHIFT_ICONS[shift]} {SHIFT_LABELS[shift]}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[11px] text-muted-foreground hover:text-primary"
                            onClick={() => openNewForm(day, shift)}
                          >
                            <Plus className="h-3 w-3 mr-0.5" /> Agendar
                          </Button>
                        </div>

                        {appts.length === 0 ? (
                          <button
                            type="button"
                            className="w-full border border-dashed border-border/60 rounded-lg py-3 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
                            onClick={() => openNewForm(day, shift)}
                          >
                            + Agendar aqui
                          </button>
                        ) : (
                          <div className="space-y-2">
                            {appts.map(appt => (
                              <AppointmentCard
                                key={appt.id}
                                appt={appt}
                                onEdit={() => openEditForm(appt)}
                                onDelete={() => deleteAppointment(appt.id)}
                                onStatusChange={status => updateAppointment({ id: appt.id, status })}
                              />
                            ))}
                            <button
                              type="button"
                              className="w-full border border-dashed border-border/40 rounded-lg py-2 text-[11px] text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
                              onClick={() => openNewForm(day, shift)}
                            >
                              + Agendar outro
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
        </>
      )}

      {/* Modal de agendamento */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingAppt ? 'Editar Agendamento' : 'Novo Agendamento'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            {/* Data e turno */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Data</Label>
                <Input
                  type="date"
                  value={form.appointment_date}
                  onChange={e => setForm(f => ({ ...f, appointment_date: e.target.value }))}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Turno</Label>
                <Select value={form.shift} onValueChange={v => setForm(f => ({ ...f, shift: v as AppointmentShift }))}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manha">☀️ Manhã</SelectItem>
                    <SelectItem value="tarde">🌤️ Tarde</SelectItem>
                    <SelectItem value="dia_todo">📅 Dia todo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Busca de cliente */}
            <div className="space-y-1">
              <Label className="text-xs">Cliente</Label>
              <Input
                placeholder="Nome ou telefone do cliente..."
                value={clientSearch}
                onChange={e => {
                  setClientSearch(e.target.value);
                  setForm(f => ({ ...f, client_name: e.target.value, client_id: '' }));
                }}
                className="h-9 text-sm"
              />
              {filteredClients.length > 0 && (
                <div className="rounded-lg border border-border bg-card shadow-md overflow-hidden">
                  {filteredClients.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors border-b last:border-0"
                      onClick={() => {
                        setClientSearch(c.name);
                        setForm(f => ({
                          ...f,
                          client_name: c.name,
                          client_phone: c.phone ?? '',
                          client_id: c.id,
                        }));
                      }}
                    >
                      <span className="font-medium">{c.name}</span>
                      {c.phone && <span className="text-muted-foreground ml-2 text-xs">{c.phone}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Telefone */}
            <div className="space-y-1">
              <Label className="text-xs">Telefone / WhatsApp</Label>
              <div className="relative">
                <Input
                  placeholder="Ex: 75988388629"
                  value={form.client_phone}
                  onChange={async e => {
                    const phone = e.target.value;
                    setForm(f => ({ ...f, client_phone: phone, client_id: '' }));
                    const digits = phone.replace(/\D/g, '');
                    if (digits.length >= 10) {
                      const found = await searchClientByPhone(digits);
                      if (found) {
                        setClientSearch(found.name);
                        setForm(f => ({ ...f, client_name: found.name, client_phone: found.phone ?? phone, client_id: found.id }));
                      }
                    }
                  }}
                  className="h-9 text-sm pr-8"
                />
                {form.client_id && (
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-green-500 text-xs font-bold">✓</span>
                )}
              </div>
              {form.client_id && (
                <p className="text-xs text-green-600 font-medium">Cliente encontrado no banco de dados</p>
              )}
            </div>

            {/* Moto */}
            <div className="space-y-1">
              <Label className="text-xs">{VEHICLE_CAP}</Label>
              <Input
                placeholder={VEHICLE_CAP === 'Carro' ? 'Ex: Fiat Uno 1.0 2020' : 'Ex: Honda CG 160 2022'}
                value={form.equipment}
                onChange={e => setForm(f => ({ ...f, equipment: e.target.value }))}
                className="h-9 text-sm"
              />
            </div>

            {/* Serviço */}
            <div className="space-y-1">
              <Label className="text-xs">O que vai fazer</Label>
              <Input
                placeholder="Ex: Revisão completa, troca de óleo..."
                value={form.service_description}
                onChange={e => setForm(f => ({ ...f, service_description: e.target.value }))}
                className="h-9 text-sm"
              />
            </div>

            {/* Mecânico */}
            <div className="space-y-1">
              <Label className="text-xs">Mecânico (opcional)</Label>
              <Select value={form.mechanic_id || 'none'} onValueChange={v => setForm(f => ({ ...f, mechanic_id: v === 'none' ? '' : v }))}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Sem mecânico definido" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem mecânico</SelectItem>
                  {mechanics.filter(m => m.active).map(m => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Status (só na edição) */}
            {editingAppt && (
              <div className="space-y-1">
                <Label className="text-xs">Status</Label>
                <Select
                  value={form.status}
                  onValueChange={v => setForm(f => ({ ...f, status: v as AppointmentStatus }))}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="agendado">Agendado</SelectItem>
                    <SelectItem value="confirmado">Confirmado</SelectItem>
                    <SelectItem value="cancelado">Cancelado</SelectItem>
                    <SelectItem value="realizado">Realizado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Observações */}
            <div className="space-y-1">
              <Label className="text-xs">Observações (opcional)</Label>
              <Textarea
                placeholder="Alguma observação importante..."
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                className="text-sm min-h-[70px] resize-none"
              />
            </div>
          </div>

          <DialogFooter className="flex gap-2 pt-2">
            {editingAppt && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button type="button" variant="destructive" size="sm" className="mr-auto">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remover agendamento?</AlertDialogTitle>
                    <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => { deleteAppointment(editingAppt.id); setShowForm(false); }} className="bg-destructive">
                      Remover
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
            {editingAppt && onConvertToOS && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => { setShowForm(false); onConvertToOS(editingAppt); }}
                className="gap-1.5"
              >
                <ClipboardList className="h-4 w-4" />
                Abrir OS
              </Button>
            )}
            <Button
              type="button"
              onClick={handleSave}
              disabled={isCreating || !form.client_name || !form.equipment || !form.service_description || !form.appointment_date}
            >
              {isCreating ? 'Salvando...' : editingAppt ? 'Salvar' : 'Agendar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
