// Abertura e fechamento do caixa (conferência da gaveta). Só aparece se a loja ligou em Ajustes.
// Esperado na gaveta = troco + entradas em dinheiro - saídas em dinheiro - retiradas (desde a abertura).
// Contas no banco: abrir_caixa / resumo_caixa_turno / fechar_caixa.
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DoorClosed, DoorOpen, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useStore } from '@/contexts/StoreContext';
import { useColaboradorLogado } from '@/hooks/useColaboradorLogado';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const brl = (v: number) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const hora = (d: string) => new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const diaHora = (d: string) => new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const num = (v: string) => {
  const s = String(v).trim();
  const n = parseFloat(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
  return Number.isFinite(n) ? n : NaN;
};
const FORMA: Record<string, string> = { dinheiro: 'Dinheiro', pix: 'Pix', cartao: 'Cartão', cartao_credito: 'Crédito', cartao_debito: 'Débito', outro: 'Outro' };

interface Turno {
  id: string; aberto_em: string; aberto_por: string; valor_abertura: number;
  fechado_em: string | null; fechado_por: string | null; esperado: number | null; contado: number | null;
  diferenca: number | null; deixou_gaveta: number | null; observacao: string | null;
}
interface Resumo {
  abertura: number; entradas_dinheiro: number; saidas_dinheiro: number; retiradas: number; esperado: number;
  por_forma: Record<string, number>;
}

export function TurnoCaixa({ ocultar }: { ocultar?: boolean }) {
  const { storeId, permissions } = useStore();
  const pode = permissions.abrir_fechar_caixa !== false;
  const [janela, setJanela] = useState<'abrir' | 'fechar' | null>(null);
  const [verHistorico, setVerHistorico] = useState(false);
  const v = (x: number) => (ocultar ? '****' : brl(x));

  const { data: ligado } = useQuery({
    queryKey: ['caixa-turno', 'ligado', storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data } = await db.from('store_settings').select('usa_abertura_caixa').eq('id', storeId).maybeSingle();
      return !!data?.usa_abertura_caixa;
    },
  });
  const turnos = useQuery({
    queryKey: ['caixa-turno', 'lista', storeId],
    enabled: !!storeId && !!ligado,
    queryFn: async () => {
      const { data, error } = await db.from('caixa_turnos').select('*').eq('store_id', storeId).order('aberto_em', { ascending: false }).limit(11);
      if (error) throw error;
      return (data ?? []) as Turno[];
    },
  });
  const aberto = (turnos.data ?? []).find((t) => !t.fechado_em) ?? null;
  const ultimoFechado = (turnos.data ?? []).find((t) => !!t.fechado_em) ?? null;
  const resumo = useQuery({
    queryKey: ['caixa-turno', 'resumo', aberto?.id],
    enabled: !!aberto,
    queryFn: async () => {
      const { data, error } = await db.rpc('resumo_caixa_turno', { p_turno: aberto!.id });
      if (error) throw error;
      return data as Resumo;
    },
  });

  if (!ligado || turnos.isLoading) return null;
  // Caixa esquecido aberto de outro dia: trava as vendas até fechar aquele dia (banco também barra)
  const diaSP = (d: Date | string) => new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const abertoOutroDia = !!aberto && diaSP(aberto.aberto_em) !== diaSP(new Date());

  return (
    <div className={cn('rounded-xl border p-3 space-y-2', abertoOutroDia ? 'border-red-500/60 bg-red-500/10' : aberto ? 'border-green-600/50 bg-green-600/5' : 'border-amber-500/50 bg-amber-500/5')}>
      {abertoOutroDia && (
        <div className="rounded-md bg-red-500/15 px-2.5 py-2 text-sm">
          <p className="font-semibold text-red-500">⚠️ O caixa do dia {diaSP(aberto!.aberto_em)} ainda está aberto</p>
          <p className="text-xs text-muted-foreground">Feche o caixa daquele dia (conte a gaveta) antes de abrir o de hoje. Até fechar, não dá para lançar vendas.</p>
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          {aberto ? (
            <>
              <p className="text-sm font-semibold flex items-center gap-1.5"><DoorOpen className="h-4 w-4 text-green-600" /> Caixa aberto</p>
              <p className="text-xs text-muted-foreground">Desde {hora(aberto.aberto_em)} por {aberto.aberto_por} · abertura {v(aberto.valor_abertura)}</p>
              {resumo.data && <p className="text-xs">Na gaveta agora (esperado): <strong>{v(resumo.data.esperado)}</strong></p>}
            </>
          ) : (
            <>
              <p className="text-sm font-semibold flex items-center gap-1.5"><DoorClosed className="h-4 w-4 text-amber-500" /> Caixa fechado</p>
              {ultimoFechado && (
                <p className="text-xs text-muted-foreground">
                  Último fechamento {diaHora(ultimoFechado.fechado_em!)} por {ultimoFechado.fechado_por} · {textoDiferenca(ultimoFechado.diferenca ?? 0, ocultar)}
                </p>
              )}
            </>
          )}
        </div>
        {pode && (
          <Button size="sm" variant={aberto ? 'outline' : 'default'} onClick={() => setJanela(aberto ? 'fechar' : 'abrir')}>
            {aberto ? 'Fechar caixa' : 'Abrir caixa'}
          </Button>
        )}
      </div>

      {(turnos.data ?? []).some((t) => t.fechado_em) && (
        <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setVerHistorico((x) => !x)}>
          {verHistorico ? 'Esconder fechamentos' : 'Ver fechamentos anteriores'}
        </button>
      )}
      {verHistorico && (
        <div className="space-y-1">
          {(turnos.data ?? []).filter((t) => t.fechado_em).map((t) => (
            <div key={t.id} className="flex justify-between gap-2 text-xs border-t pt-1">
              <span className="text-muted-foreground">{diaHora(t.aberto_em)} → {diaHora(t.fechado_em!)} · {t.fechado_por}{t.observacao ? ` · ${t.observacao}` : ''}</span>
              <span className={cn('flex-shrink-0', (t.diferenca ?? 0) < 0 ? 'text-red-500' : (t.diferenca ?? 0) > 0 ? 'text-blue-500' : 'text-green-600')}>
                {textoDiferenca(t.diferenca ?? 0, ocultar)}
              </span>
            </div>
          ))}
        </div>
      )}

      {janela === 'abrir' && <JanelaAbrir sugestao={0} onClose={() => setJanela(null)} />}
      {janela === 'fechar' && aberto && <JanelaFechar turno={aberto} onClose={() => setJanela(null)} />}
    </div>
  );
}

function textoDiferenca(d: number, ocultar?: boolean) {
  if (Math.abs(d) < 0.005) return 'bateu';
  const valor = ocultar ? '****' : brl(Math.abs(d));
  return d < 0 ? `faltou ${valor}` : `sobrou ${valor}`;
}

function useQuem() {
  const eu = useColaboradorLogado();
  const { storeId } = useStore();
  const { data: pessoas = [] } = useQuery({
    queryKey: ['pessoas-vale', storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data } = await db.rpc('listar_pessoas_vale');
      return ((data ?? []) as { id: string; nome: string }[]).map((p) => p.nome);
    },
  });
  return { inicial: eu?.nome ?? '', pessoas };
}

function CampoQuem({ valor, onChange, pessoas }: { valor: string; onChange: (v: string) => void; pessoas: string[] }) {
  return (
    <div>
      <p className="mb-1 text-sm font-medium">Quem está fazendo?</p>
      <Input value={valor} onChange={(e) => onChange(e.target.value)} placeholder="Nome" list="quem-caixa" />
      <datalist id="quem-caixa">{pessoas.map((p) => <option key={p} value={p} />)}</datalist>
      {pessoas.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {pessoas.slice(0, 8).map((p) => (
            <button key={p} type="button" onClick={() => onChange(p)}
              className={cn('text-xs rounded-full border px-2 py-0.5', valor === p ? 'border-primary bg-primary/10 text-primary' : 'border-border')}>{p}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function JanelaAbrir({ sugestao, onClose }: { sugestao: number; onClose: () => void }) {
  const qc = useQueryClient();
  const { inicial, pessoas } = useQuem();
  const [quem, setQuem] = useState(inicial);
  const [troco, setTroco] = useState(sugestao ? String(sugestao).replace('.', ',') : '');
  const [salvando, setSalvando] = useState(false);
  const valor = troco.trim() === '' ? 0 : num(troco);

  const abrir = async () => {
    if (!quem.trim()) { toast.error('Diga quem está abrindo o caixa.'); return; }
    if (troco.trim() === '') { toast.error('Conte o dinheiro da gaveta e digite o valor (se estiver vazia, digite 0).'); return; }
    if (Number.isNaN(valor) || valor < 0) { toast.error('Valor do troco inválido.'); return; }
    setSalvando(true);
    const { error } = await db.rpc('abrir_caixa', { p_valor: valor, p_quem: quem.trim() });
    setSalvando(false);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ['caixa-turno'] });
    toast.success('Caixa aberto.');
    onClose();
  };

  return (
    <Dialog open onOpenChange={(a) => { if (!a) onClose(); }}>
      <DialogContent className="max-sm:top-auto max-sm:bottom-0 max-sm:translate-y-0 max-sm:rounded-t-2xl max-sm:rounded-b-none">
        <DialogHeader>
          <DialogTitle className="text-left">Abrir caixa</DialogTitle>
          <DialogDescription className="text-left">Conte o dinheiro que está na gaveta para o troco.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <p className="mb-1 text-sm font-medium">Dinheiro na gaveta ao abrir (R$)</p>
            <Input inputMode="decimal" className="h-12 text-lg" value={troco} onChange={(e) => setTroco(e.target.value.replace(/[^\d.,]/g, ''))} placeholder="Digite o valor contado" />
            {sugestao > 0 && <p className="text-[11px] text-muted-foreground mt-1">No último fechamento ficou {brl(sugestao)} na gaveta.</p>}
          </div>
          <CampoQuem valor={quem} onChange={setQuem} pessoas={pessoas} />
          <Button className="w-full h-12" onClick={abrir} disabled={salvando}>{salvando ? 'Abrindo...' : 'Abrir caixa'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function JanelaFechar({ turno, onClose }: { turno: Turno; onClose: () => void }) {
  const qc = useQueryClient();
  const { inicial, pessoas } = useQuem();
  const [quem, setQuem] = useState(inicial);
  const [contado, setContado] = useState('');
  const [deixar, setDeixar] = useState(String(turno.valor_abertura || 0).replace('.', ','));
  const [obs, setObs] = useState('');
  const [salvando, setSalvando] = useState(false);

  // Conta na hora de abrir a janela (pega o que entrou até agora)
  const { data: r, isLoading } = useQuery({
    queryKey: ['caixa-turno', 'resumo-fechar', turno.id],
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await db.rpc('resumo_caixa_turno', { p_turno: turno.id });
      if (error) throw error;
      return data as Resumo;
    },
  });
  const vContado = contado.trim() === '' ? NaN : num(contado);
  const vDeixarDigitado = deixar.trim() === '' ? NaN : num(deixar);
  // Contou menos que o troco sugerido: fica tudo na gaveta (sem retirada)
  const vDeixar = !Number.isNaN(vDeixarDigitado) && !Number.isNaN(vContado) ? Math.min(vDeixarDigitado, vContado) : vDeixarDigitado;
  const dif = r && !Number.isNaN(vContado) ? Math.round((vContado - r.esperado) * 100) / 100 : null;
  const outras = useMemo(() => Object.entries(r?.por_forma ?? {}).filter(([f, t]) => f !== 'dinheiro' && Math.abs(Number(t)) > 0.005), [r]);

  const fechar = async () => {
    if (!quem.trim()) { toast.error('Diga quem está fechando o caixa.'); return; }
    if (Number.isNaN(vContado) || vContado < 0) { toast.error('Informe o dinheiro contado na gaveta.'); return; }
    setSalvando(true);
    const { error } = await db.rpc('fechar_caixa', { p_contado: vContado, p_deixou: Number.isNaN(vDeixar) ? null : vDeixar, p_quem: quem.trim(), p_obs: obs });
    setSalvando(false);
    if (error) { toast.error(error.message); return; }
    for (const k of ['caixa-turno', 'cash-flow', 'cash-flow-summary', 'cash-flow-period']) qc.invalidateQueries({ queryKey: [k] });
    toast.success(dif === null || Math.abs(dif) < 0.005 ? 'Caixa fechado. Bateu!' : `Caixa fechado. ${dif < 0 ? 'Faltou' : 'Sobrou'} ${brl(Math.abs(dif))}.`);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(a) => { if (!a) onClose(); }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto max-sm:top-auto max-sm:bottom-0 max-sm:translate-y-0 max-sm:rounded-t-2xl max-sm:rounded-b-none">
        <DialogHeader>
          <DialogTitle className="text-left">Fechar caixa</DialogTitle>
          <DialogDescription className="text-left">Conte o dinheiro da gaveta e compare com o que o sistema espera.</DialogDescription>
        </DialogHeader>
        {isLoading || !r ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Calculando...</p>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border p-3 text-sm space-y-0.5">
              <L n="Troco da abertura" v={brl(r.abertura)} />
              <L n="Entradas em dinheiro" v={`+ ${brl(r.entradas_dinheiro)}`} />
              <L n="Saídas em dinheiro" v={`− ${brl(r.saidas_dinheiro)}`} />
              <L n="Retiradas" v={`− ${brl(r.retiradas)}`} />
              <div className="flex justify-between border-t pt-1 font-semibold"><span>Deve ter na gaveta</span><span>{brl(r.esperado)}</span></div>
            </div>
            {outras.length > 0 && (
              <div className="rounded-lg border p-3 text-xs space-y-0.5">
                <p className="text-muted-foreground mb-1">Outras formas no período (para conferir maquininha e Pix):</p>
                {outras.map(([f, t]) => <L key={f} n={FORMA[f] ?? f} v={brl(Number(t))} />)}
              </div>
            )}
            <div>
              <p className="mb-1 text-sm font-medium">Dinheiro contado na gaveta (R$)</p>
              <Input inputMode="decimal" className="h-12 text-lg" value={contado} onChange={(e) => setContado(e.target.value.replace(/[^\d.,]/g, ''))} placeholder="0,00" autoFocus />
              {dif !== null && (
                <p className={cn('text-sm font-semibold mt-1', Math.abs(dif) < 0.005 ? 'text-green-600' : dif < 0 ? 'text-red-500' : 'text-blue-500')}>
                  {Math.abs(dif) < 0.005 ? 'Bateu certinho' : dif < 0 ? `Faltando ${brl(-dif)}` : `Sobrando ${brl(dif)}`}
                </p>
              )}
            </div>
            <div>
              <p className="mb-1 text-sm font-medium">Quanto fica na gaveta para o próximo caixa (R$)</p>
              <Input inputMode="decimal" value={deixar} onChange={(e) => setDeixar(e.target.value.replace(/[^\d.,]/g, ''))} placeholder="Deixe vazio para não lançar retirada" />
              {!Number.isNaN(vContado) && !Number.isNaN(vDeixar) && vContado - vDeixar > 0.005 && (
                <p className="text-[11px] text-muted-foreground mt-1">O resto ({brl(vContado - vDeixar)}) entra como retirada no caixa.</p>
              )}
              {!Number.isNaN(vContado) && !Number.isNaN(vDeixarDigitado) && vDeixarDigitado > vContado + 0.005 && (
                <p className="text-[11px] text-amber-500 mt-1">Contou menos que isso: fica tudo ({brl(vContado)}) na gaveta, sem retirada.</p>
              )}
            </div>
            <CampoQuem valor={quem} onChange={setQuem} pessoas={pessoas} />
            <div>
              <p className="mb-1 text-sm font-medium">Observação (opcional)</p>
              <Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: faltou R$ 10 de troco dado errado" />
            </div>
            <Button className="w-full h-12" onClick={fechar} disabled={salvando}>{salvando ? 'Fechando...' : 'Fechar caixa'}</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function L({ n, v }: { n: string; v: string }) {
  return <div className="flex justify-between"><span className="text-muted-foreground">{n}</span><span>{v}</span></div>;
}
