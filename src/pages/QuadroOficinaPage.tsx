// v2: Oficina — todas as motos ativas, com a próxima etapa em 1 toque (sem selects).
// Etapa única (lib/etapaOS): o status da OS manda. Celular primeiro.
import { useMemo, useState } from 'react';
import { differenceInDays, format, isPast, isToday, parseISO } from 'date-fns';
import { AlertTriangle, CheckCircle2, Clock, Loader2, Search, User } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { matchesSearch } from '@/lib/textSearch';
import { useMechanics } from '@/hooks/useMechanics';
import { useMudarEtapa, useOficinaAtivas } from '@/hooks/useOficina';
import { ETAPAS, acoesDa, etapaDe, precisaMecanico, type Etapa } from '@/lib/etapaOS';
import type { ServiceOrder } from '@/types/service-order';

type Urgencia = 'atrasada' | 'hoje' | 'ok' | 'sem_previsao';
const urgenciaDe = (prev?: string | null): Urgencia => {
  if (!prev) return 'sem_previsao';
  const d = parseISO(prev);
  if (isToday(d)) return 'hoje';
  return isPast(d) ? 'atrasada' : 'ok';
};
const ORDEM_URG: Urgencia[] = ['atrasada', 'hoje', 'sem_previsao', 'ok'];
const FILTROS: (Etapa | 'todas')[] = ['todas', 'fila', 'servico', 'peca', 'pronta'];

export default function QuadroOficinaPage({ onSelectOrder, onPronta, filtroInicial }: {
  onSelectOrder: (order: ServiceOrder) => void;
  /** Moto ficou pronta: abre "Avisar o cliente?" (com o desfazer junto). */
  onPronta?: (nova: ServiceOrder, desfazer: () => Promise<boolean>) => void;
  /** Veio de um número do Início: já abre filtrado. */
  filtroInicial?: Etapa | 'todas';
}) {
  const { data: ativas = [], isLoading, isError, refetch } = useOficinaAtivas();
  const { mechanics } = useMechanics();
  const { mudar, desfazer } = useMudarEtapa();
  const [filtro, setFiltro] = useState<Etapa | 'todas'>(filtroInicial ?? 'todas');
  const [busca, setBusca] = useState('');
  const [escolherMecanico, setEscolherMecanico] = useState<{ os: ServiceOrder; destino: Exclude<Etapa, 'entregue'> } | null>(null);
  const [mexendo, setMexendo] = useState<string | null>(null);

  const comEtapa = useMemo(() => ativas.map((os) => ({ os, etapa: etapaDe(os) })), [ativas]);
  const contagem = useMemo(() => {
    const c: Record<string, number> = { todas: comEtapa.length };
    for (const { etapa } of comEtapa) c[etapa] = (c[etapa] ?? 0) + 1;
    return c;
  }, [comEtapa]);

  const lista = useMemo(() => comEtapa
    .filter(({ etapa }) => filtro === 'todas' || etapa === filtro)
    .filter(({ os }) => matchesSearch(busca, os.client_name, os.equipment, os.client_phone, os.id))
    .sort((a, b) => {
      const ua = ORDEM_URG.indexOf(urgenciaDe(a.os.previsao_entrega));
      const ub = ORDEM_URG.indexOf(urgenciaDe(b.os.previsao_entrega));
      if (ua !== ub) return ua - ub;
      return (a.os.entry_date ?? '').localeCompare(b.os.entry_date ?? '');
    }), [comEtapa, filtro, busca]);

  const executar = async (os: ServiceOrder, destino: Exclude<Etapa, 'entregue'>, mecanicoId?: string) => {
    if (!mecanicoId && precisaMecanico(destino, os.mechanic_id)) { setEscolherMecanico({ os, destino }); return; }
    setMexendo(os.id);
    try {
      const { nova, anterior } = await mudar.mutateAsync({ os, destino, mecanicoId });
      const voltar = () => desfazer(nova, anterior);
      if (destino === 'pronta' && onPronta) {
        onPronta(nova, voltar);   // a janela "Avisar o cliente?" traz o Desfazer
      } else {
        toast(`${os.client_name.split(' ')[0]}: ${ETAPAS[destino].nome}`, { duration: 5000, action: { label: 'Desfazer', onClick: () => { void voltar(); } } });
      }
    } catch { /* toast já mostrado */ } finally {
      setMexendo(null);
    }
  };

  const nomeMecanico = (id?: string | null) => mechanics.find((m) => m.id === id)?.name;

  return (
    <div className="space-y-3 pb-28">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome, placa ou telefone" className="h-12 pl-9 text-base" />
      </div>

      {/* Filtros por etapa (com quantidade) */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-hide">
        {FILTROS.map((f) => (
          <button key={f} type="button" onClick={() => setFiltro(f)}
            className={cn('flex h-10 shrink-0 items-center gap-1 rounded-full border px-3 text-sm font-semibold',
              filtro === f ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground')}>
            {f === 'todas' ? 'Todas' : ETAPAS[f].nome} <span className="tabular-nums">{contagem[f] ?? 0}</span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-36 rounded-xl" />)}</div>
      ) : isError ? (
        <div className="space-y-3 rounded-xl border border-border p-4 text-sm">
          <p>Não consegui carregar a oficina.</p>
          <Button variant="outline" onClick={() => refetch()}>Tentar de novo</Button>
        </div>
      ) : lista.length === 0 ? (
        <p className="rounded-xl border border-border p-6 text-center text-sm text-muted-foreground">
          {busca ? `Nenhuma moto com "${busca}".` : 'Nenhuma moto nessa etapa.'}
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {lista.map(({ os, etapa }) => {
            const urg = urgenciaDe(os.previsao_entrega);
            const dias = os.entry_date ? differenceInDays(new Date(), parseISO(os.entry_date)) : null;
            const acoes = acoesDa(etapa);
            const ocupado = mexendo === os.id;
            return (
              <div key={os.id} className="overflow-hidden rounded-xl border border-border bg-card">
                <div className={cn('h-1.5', urg === 'atrasada' ? 'bg-red-500' : urg === 'hoje' ? 'bg-yellow-400' : 'bg-transparent')} />
                <div className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <button type="button" onClick={() => onSelectOrder(os)} className="min-w-0 text-left">
                      <h3 className="truncate text-base font-bold leading-tight">{os.client_name}</h3>
                      <p className="truncate text-sm text-muted-foreground">{os.equipment}</p>
                    </button>
                    <span className={cn('shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold', ETAPAS[etapa].fundo, ETAPAS[etapa].cor)}>
                      {ETAPAS[etapa].nome}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {urg === 'atrasada' && <span className="flex items-center gap-1 font-semibold text-red-500"><AlertTriangle className="h-3.5 w-3.5" /> Atrasada</span>}
                    {urg === 'hoje' && <span className="flex items-center gap-1 font-semibold text-yellow-500"><Clock className="h-3.5 w-3.5" /> Entrega hoje</span>}
                    {dias !== null && <span>{dias === 0 ? 'Entrou hoje' : `${dias} dia${dias === 1 ? '' : 's'} na oficina`}</span>}
                    {os.previsao_entrega && urg !== 'hoje' && <span>Previsão {format(parseISO(os.previsao_entrega), 'dd/MM')}</span>}
                    <span className="flex items-center gap-1"><User className="h-3.5 w-3.5" />{nomeMecanico(os.mechanic_id) ?? 'Sem mecânico'}</span>
                  </div>

                  {acoes.length > 0 && (
                    <div className="flex gap-2">
                      {acoes.map((a, i) => (
                        <Button key={a.destino} disabled={ocupado} onClick={() => executar(os, a.destino)}
                          variant={i === 0 ? 'default' : 'outline'} className={cn('h-14 flex-1 text-base', i > 0 && 'flex-none px-4')}>
                          {ocupado && i === 0 ? <Loader2 className="h-5 w-5 animate-spin" /> : a.rotulo}
                        </Button>
                      ))}
                    </div>
                  )}
                  {etapa === 'pronta' && (
                    <p className="flex items-center gap-1 text-sm text-green-500">
                      <CheckCircle2 className="h-4 w-4" />
                      {os.aviso_retirada_enviado_em ? 'Pronta · cliente avisado' : 'Pronta · esperando o cliente'}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* "Quem vai fazer?" — escolhe o mecânico e já avança */}
      {escolherMecanico && (
        <AlertDialog open onOpenChange={(a) => { if (!a) setEscolherMecanico(null); }}>
          <AlertDialogContent className="max-sm:top-auto max-sm:bottom-0 max-sm:translate-y-0 max-sm:rounded-t-2xl max-sm:rounded-b-none max-sm:pb-8">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-left">Quem vai fazer?</AlertDialogTitle>
              <AlertDialogDescription className="text-left">{escolherMecanico.os.client_name} · {escolherMecanico.os.equipment}</AlertDialogDescription>
            </AlertDialogHeader>
            <div className="grid grid-cols-2 gap-2">
              {mechanics.filter((m) => m.active !== false).map((m) => (
                <Button key={m.id} variant="outline" className="h-14 text-base"
                  onClick={() => { const p = escolherMecanico; setEscolherMecanico(null); void executar(p.os, p.destino, m.id); }}>
                  {m.name}
                </Button>
              ))}
            </div>
            <Button variant="ghost" className="h-12" onClick={() => setEscolherMecanico(null)}>Cancelar</Button>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
