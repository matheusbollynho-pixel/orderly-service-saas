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
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { hojeLoja, montarResumoFinanceiro, type DadosFinanceiro } from '../../../supabase/functions/_shared/financeiro/mensagem';

type SettingsHook = ReturnType<typeof useStoreSettings>;

/** Mostra o texto como o WhatsApp: *negrito* e _itálico_. */
function TextoWhatsapp({ texto }: { texto: string }) {
  const partes = texto.split(/(\*[^*\n]+\*|_[^_\n]+_)/g);
  return (
    <>
      {partes.map((p, i) => p.length > 2 && p.startsWith('*') && p.endsWith('*') ? <strong key={i}>{p.slice(1, -1)}</strong>
        : p.length > 2 && p.startsWith('_') && p.endsWith('_') ? <em key={i}>{p.slice(1, -1)}</em>
        : <span key={i}>{p}</span>)}
    </>
  );
}

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

/** Números que recebem os alertas no WhatsApp: boletos (dono e financeiro) e validade de produtos (só o dono). */
export function AlertasBoletoCard() {
  const { isOwner, storeId } = useStore();
  const { settings, saving, saveSettings } = useStoreSettings();
  const [dono, setDono] = useState('');
  const [financeiro, setFinanceiro] = useState('');
  const [validade, setValidade] = useState(true);
  const [resumoDia, setResumoDia] = useState(false);
  const [resumoSemana, setResumoSemana] = useState(false);
  const [previa, setPrevia] = useState<string | null>(null);
  const [carregandoPrevia, setCarregandoPrevia] = useState(false);

  useEffect(() => {
    if (!settings) return;
    const s = settings as { alerta_validade_whatsapp?: boolean; financeiro_resumo_diario?: boolean; financeiro_resumo_semanal?: boolean };
    setDono(settings.boleto_notify_phone_1 || '');
    setFinanceiro(settings.boleto_notify_phone_2 || '');
    setValidade(s.alerta_validade_whatsapp !== false);
    setResumoDia(!!s.financeiro_resumo_diario);
    setResumoSemana(!!s.financeiro_resumo_semanal);
  }, [settings]);

  // Prévia: o mesmo texto que o robô manda, com os números de hoje (não envia nada)
  const verPrevia = async () => {
    setCarregandoPrevia(true);
    try {
      const hoje = hojeLoja();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('financeiro_resumo', { p_store_id: storeId, p_ini: hoje, p_fim: hoje });
      if (error) throw error;
      setPrevia(montarResumoFinanceiro(data as DadosFinanceiro, settings?.company_name || 'Minha loja', 'diario')
        ?? 'Hoje ainda não teve venda nem movimento no caixa. Nesse caso a mensagem não é enviada.');
    } catch (e) {
      toast.error((e as Error).message || 'Não consegui montar o resumo.');
    } finally {
      setCarregandoPrevia(false);
    }
  };

  if (!isOwner) return null;
  const soDigitos = (v: string) => v.replace(/\D/g, '');

  return (
    <CaixaAjuste titulo="Alertas no WhatsApp">
      <div className="space-y-1">
        <Label>Dono / responsável</Label>
        <Input inputMode="numeric" value={dono} onChange={(e) => setDono(soDigitos(e.target.value))} placeholder="DDD + número" />
      </div>
      <div className="space-y-1">
        <Label>Financeiro</Label>
        <Input inputMode="numeric" value={financeiro} onChange={(e) => setFinanceiro(soDigitos(e.target.value))} placeholder="DDD + número" />
      </div>
      <p className="text-xs text-muted-foreground">Os dois recebem o aviso de boleto vencendo e vencido.</p>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5 h-4 w-4" checked={validade} onChange={(e) => setValidade(e.target.checked)} />
        <span>
          Avisar o dono sobre validade de produtos
          <span className="block text-xs text-muted-foreground">1 mensagem por dia, só quando tem lote entrando no prazo de aviso, faltando 7 dias, vencendo hoje ou vencido ontem.</span>
        </span>
      </label>
      <div className="space-y-2 rounded-md border border-border p-2">
        <p className="text-sm font-medium">Resumo financeiro para o dono</p>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 h-4 w-4" checked={resumoDia} onChange={(e) => setResumoDia(e.target.checked)} />
          <span>
            Fechamento do dia, às 20h
            <span className="block text-xs text-muted-foreground">Quanto vendeu, entrou por forma de pagamento, saiu, lucro das peças e o que precisa de atenção. Dia sem movimento não manda.</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 h-4 w-4" checked={resumoSemana} onChange={(e) => setResumoSemana(e.target.checked)} />
          <span>
            Resumo da semana, segunda às 8h
            <span className="block text-xs text-muted-foreground">A semana passada inteira comparada com a anterior.</span>
          </span>
        </label>
        <Button type="button" variant="outline" size="sm" className="w-full" disabled={carregandoPrevia || !storeId} onClick={verPrevia}>
          {carregandoPrevia ? 'Calculando...' : 'Ver exemplo com os números de hoje'}
        </Button>
      </div>
      <Button className="w-full" disabled={saving || !settings}
        onClick={() => saveSettings({
          boleto_notify_phone_1: dono || null, boleto_notify_phone_2: financeiro || null, alerta_validade_whatsapp: validade,
          financeiro_resumo_diario: resumoDia, financeiro_resumo_semanal: resumoSemana,
        } as Partial<StoreSettings>)}>
        {saving ? 'Salvando...' : 'Salvar'}
      </Button>
      {(resumoDia || resumoSemana) && !dono && <p className="text-xs text-amber-500">Cadastre o número do dono para receber o resumo.</p>}
      <Dialog open={previa !== null} onOpenChange={(o) => { if (!o) setPrevia(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Exemplo do resumo de hoje</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">É assim que chega no WhatsApp do dono (nada foi enviado agora).</p>
          <pre className="whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-sm font-sans max-h-[60vh] overflow-y-auto">{previa && <TextoWhatsapp texto={previa} />}</pre>
        </DialogContent>
      </Dialog>
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
