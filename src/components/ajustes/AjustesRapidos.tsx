// Ajustes que moraram em Configurações → Loja e foram para perto de onde são usados.
// Só o dono vê (mesma regra da tela de Configurações).
import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Settings2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useStore } from '@/contexts/StoreContext';
import { useStoreSettings, type StoreSettings } from '@/hooks/useStoreSettings';
import { useVehicleLabel } from '@/hooks/useVehicleLabel';

type SettingsHook = ReturnType<typeof useStoreSettings>;

function CaixaAjuste({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  const [aberto, setAberto] = useState(false);
  return (
    <Card>
      <CardContent className="p-3 space-y-3">
        <button type="button" onClick={() => setAberto((v) => !v)}
          className="w-full flex items-center justify-between text-sm text-muted-foreground hover:text-foreground">
          <span className="flex items-center gap-2"><Settings2 className="h-4 w-4" /> {titulo}</span>
          {aberto ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {aberto && children}
      </CardContent>
    </Card>
  );
}

/** Números que recebem os alertas de boletos (contas a pagar) no WhatsApp. */
export function AlertasBoletoCard() {
  const { isOwner } = useStore();
  const { settings, saving, saveSettings } = useStoreSettings();
  const [dono, setDono] = useState('');
  const [financeiro, setFinanceiro] = useState('');

  useEffect(() => {
    if (!settings) return;
    setDono(settings.boleto_notify_phone_1 || '');
    setFinanceiro(settings.boleto_notify_phone_2 || '');
  }, [settings]);

  if (!isOwner) return null;
  const soDigitos = (v: string) => v.replace(/\D/g, '');

  return (
    <CaixaAjuste titulo="Alertas de boletos no WhatsApp">
      <div className="space-y-1">
        <Label>Dono / responsável</Label>
        <Input inputMode="numeric" value={dono} onChange={(e) => setDono(soDigitos(e.target.value))} placeholder="DDD + número" />
      </div>
      <div className="space-y-1">
        <Label>Financeiro</Label>
        <Input inputMode="numeric" value={financeiro} onChange={(e) => setFinanceiro(soDigitos(e.target.value))} placeholder="DDD + número" />
      </div>
      <p className="text-xs text-muted-foreground">Esses números recebem o aviso de boleto vencendo e vencido.</p>
      <Button className="w-full" disabled={saving || !settings}
        onClick={() => saveSettings({ boleto_notify_phone_1: dono || null, boleto_notify_phone_2: financeiro || null } as Partial<StoreSettings>)}>
        {saving ? 'Salvando...' : 'Salvar números'}
      </Button>
    </CaixaAjuste>
  );
}

/** Limites da agenda. Recebe o mesmo useStoreSettings da Agenda para a tela já usar o valor novo. */
export function LimitesAgendaCard({ hook }: { hook: SettingsHook }) {
  const { isOwner } = useStore();
  const { VEHICLES_CAP } = useVehicleLabel();
  const { settings, saving, saveSettings } = hook;
  const [porDia, setPorDia] = useState(10);
  const [porHorario, setPorHorario] = useState(1);

  useEffect(() => {
    if (!settings) return;
    setPorDia(settings.max_agendamentos_dia ?? 10);
    setPorHorario(settings.max_por_horario ?? 1);
  }, [settings]);

  if (!isOwner) return null;

  return (
    <CaixaAjuste titulo="Limites da agenda">
      <div className="space-y-1">
        <Label>{VEHICLES_CAP} por dia (no máximo)</Label>
        <Input type="number" inputMode="numeric" min={1} max={100} value={porDia}
          onChange={(e) => setPorDia(Math.max(1, Number(e.target.value) || 1))} />
        <p className="text-xs text-muted-foreground">Divididos entre manhã e tarde.</p>
      </div>
      <div className="space-y-1">
        <Label>{VEHICLES_CAP} no mesmo horário</Label>
        <Input type="number" inputMode="numeric" min={1} max={20} value={porHorario}
          onChange={(e) => setPorHorario(Math.max(1, Number(e.target.value) || 1))} />
        <p className="text-xs text-muted-foreground">Use o número de mecânicos que recebem ao mesmo tempo. A IA respeita esse limite.</p>
      </div>
      <Button className="w-full" disabled={saving || !settings}
        onClick={() => saveSettings({ max_agendamentos_dia: porDia, max_por_horario: porHorario })}>
        {saving ? 'Salvando...' : 'Salvar limites'}
      </Button>
    </CaixaAjuste>
  );
}
