// Relatórios → Oficina: como a oficina está andando.
// - Agora: OS em aberto, prontas esperando o cliente buscar, atrasadas (previsão vencida).
// - No período: quantas entraram, quantas foram entregues, tempo na oficina
//   (abertura da OS → conclusão), por mecânico e veículos mais atendidos.
// Usa o status da OS (o "status da oficina" muitas vezes fica sem preencher).
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { buscarTodas } from '@/lib/buscarTodas';
import { useStore } from '@/contexts/StoreContext';
import { useMechanics } from '@/hooks/useMechanics';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { baixarPlanilha } from '@/lib/planilha';
import { deIso, iso, problemaNoPeriodo } from '@/lib/periodo';
import { cn } from '@/lib/utils';
import { BarraPeriodo, usePeriodo } from './BarraPeriodo';

const TZ = '-03:00';
const HORA = 3600_000;
const DIA = 24 * HORA;
const PLACEHOLDER = '__QR_WALKIN_PLACEHOLDER__';

interface OS {
  id: string; client_name: string; client_phone: string | null; equipment: string | null; status: string;
  created_at: string; conclusion_date: string | null; exit_date: string | null; previsao_entrega: string | null;
  mechanic_id: string | null; motorcycles: { marca: string | null; modelo: string | null } | null;
}

/** "3 h", "1,5 dia" */
function duracao(ms: number) {
  if (ms < DIA) return `${Math.max(Math.round(ms / HORA), 0)} h`;
  // Até 10 dias com 1 casa (1,5 dia); depois, dias inteiros (248 dias)
  const d = ms / DIA;
  return `${d < 10 ? d.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : Math.round(d)} dia${d >= 2 ? 's' : ''}`;
}
const mediana = (v: number[]) => { if (!v.length) return 0; const s = [...v].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const veiculo = (o: OS) => [o.motorcycles?.marca, o.motorcycles?.modelo].filter(Boolean).join(' ') || o.equipment || '';

export default function RelatorioOficina({ onOpenOrder }: { onOpenOrder?: (id: string) => void }) {
  const per = usePeriodo('mes');
  const { atual } = per.escolhido;
  const { storeId } = useStore();
  const { mechanics } = useMechanics();
  const [lista, setLista] = useState<'prontas' | 'atrasadas' | 'abertas'>('prontas');

  const de = `${atual.ini}T00:00:00${TZ}`;
  const fim1 = deIso(atual.fim); fim1.setDate(fim1.getDate() + 1);
  const ate = `${iso(fim1)}T00:00:00${TZ}`;
  const campos = 'id, client_name, client_phone, equipment, status, created_at, conclusion_date, exit_date, previsao_entrega, mechanic_id, motorcycles(marca, modelo)';

  // OS em aberto agora (não depende do período)
  const agora = useQuery({
    queryKey: ['relatorio-oficina-agora', storeId],
    enabled: !!storeId,
    staleTime: 60_000,
    queryFn: () => buscarTodas<OS>((a, b) => (supabase as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      .from('service_orders').select(campos)
      .eq('store_id', storeId).in('status', ['aberta', 'em_andamento', 'concluida']).neq('equipment', PLACEHOLDER)
      .order('id').range(a, b)),
  });

  // OS que entraram OU foram entregues no período
  const periodo = useQuery({
    queryKey: ['relatorio-oficina-periodo', storeId, atual.ini, atual.fim],
    enabled: !!storeId && !problemaNoPeriodo(atual),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [entraram, entregues, notas] = await Promise.all([
        buscarTodas<OS>((a, b) => (supabase as any) // eslint-disable-line @typescript-eslint/no-explicit-any
          .from('service_orders').select(campos)
          .eq('store_id', storeId).neq('equipment', PLACEHOLDER).gte('created_at', de).lt('created_at', ate)
          .order('id').range(a, b)),
        buscarTodas<OS>((a, b) => (supabase as any) // eslint-disable-line @typescript-eslint/no-explicit-any
          .from('service_orders').select(campos)
          .eq('store_id', storeId).eq('status', 'concluida_entregue').neq('equipment', PLACEHOLDER).gte('exit_date', de).lt('exit_date', ate)
          .order('id').range(a, b)),
        buscarTodas<{ mechanic_id: string | null; servico_rating: number | null }>((a, b) => (supabase as any) // eslint-disable-line @typescript-eslint/no-explicit-any
          .from('satisfaction_ratings').select('mechanic_id, servico_rating')
          .eq('store_id', storeId).not('servico_rating', 'is', null).gte('responded_at', de).lt('responded_at', ate)
          .order('id').range(a, b)),
      ]);
      return { entraram, entregues, notas };
    },
  });

  const nomeMec = (id: string | null) => (id ? mechanics.find((m) => m.id === id)?.name ?? 'Mecânico removido' : 'Sem mecânico');

  const r = useMemo(() => {
    if (!agora.data || !periodo.data) return null;
    const hoje = iso(new Date());
    const agoraMs = Date.now();
    const abertas = agora.data.filter((o) => o.status !== 'concluida')
      .map((o) => ({ o, dias: (agoraMs - new Date(o.created_at).getTime()) / DIA }))
      .sort((a, b) => b.dias - a.dias);
    const prontas = agora.data.filter((o) => o.status === 'concluida')
      .map((o) => ({ o, dias: (agoraMs - new Date(o.conclusion_date || o.created_at).getTime()) / DIA }))
      .sort((a, b) => b.dias - a.dias);
    const atrasadas = abertas.filter(({ o }) => o.previsao_entrega && o.previsao_entrega < hoje)
      .map(({ o }) => ({ o, dias: Math.round((deIso(hoje).getTime() - deIso(o.previsao_entrega!).getTime()) / DIA) }))
      .sort((a, b) => b.dias - a.dias);

    // Tempo na oficina das entregues no período: abertura → conclusão (ou saída)
    const tempos = periodo.data.entregues
      .map((o) => ({ o, ms: new Date(o.conclusion_date || o.exit_date!).getTime() - new Date(o.created_at).getTime() }))
      .filter((t) => t.ms >= 0);
    const noPrazo = periodo.data.entregues.filter((o) => o.previsao_entrega);
    const cumpriu = noPrazo.filter((o) => iso(new Date(o.conclusion_date || o.exit_date!)) <= o.previsao_entrega!).length;

    const mec = new Map<string, { entregues: number; tempos: number[]; notas: number[] }>();
    const pega = (id: string | null) => { const k = nomeMec(id); if (!mec.has(k)) mec.set(k, { entregues: 0, tempos: [], notas: [] }); return mec.get(k)!; };
    for (const t of tempos) { const g = pega(t.o.mechanic_id); g.entregues += 1; g.tempos.push(t.ms); }
    for (const n of periodo.data.notas) if (n.mechanic_id) pega(n.mechanic_id).notas.push(Number(n.servico_rating));

    const veic = new Map<string, number>();
    for (const o of periodo.data.entraram) {
      const v = (o.motorcycles?.marca || '').trim() || (o.equipment || '').trim().split(/\s+/)[0] || '(sem)';
      const k = v.toUpperCase();
      veic.set(k, (veic.get(k) ?? 0) + 1);
    }
    return {
      abertas, prontas, atrasadas,
      entraram: periodo.data.entraram.length,
      entregues: periodo.data.entregues.length,
      media: tempos.length ? tempos.reduce((s, t) => s + t.ms, 0) / tempos.length : 0,
      mediana: mediana(tempos.map((t) => t.ms)),
      prazo: noPrazo.length ? { cumpriu, total: noPrazo.length } : null,
      mecanicos: [...mec.entries()].sort((a, b) => b[1].entregues - a[1].entregues),
      veiculos: [...veic.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agora.data, periodo.data, mechanics]);

  const Card = ({ t, v, sub, tom, onClick, ativo }: { t: string; v: string | number; sub?: string; tom?: string; onClick?: () => void; ativo?: boolean }) => (
    <button type="button" disabled={!onClick} onClick={onClick}
      className={cn('rounded-xl border bg-card p-3 text-left', onClick && 'transition-colors hover:border-primary/60', ativo && 'border-primary ring-1 ring-primary')}>
      <p className="text-xs text-muted-foreground">{t}</p>
      <p className={cn('text-lg font-bold', tom)}>{v}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </button>
  );

  const itensLista = r ? (lista === 'prontas' ? r.prontas : lista === 'atrasadas' ? r.atrasadas : r.abertas) : [];
  const erro = agora.isError || periodo.isError;

  return (
    <div className="space-y-3">
      {erro ? (
        <p className="rounded-xl border p-4 text-sm text-red-500">Não consegui carregar os dados da oficina.</p>
      ) : !r ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : (
        <>
          <h3 className="text-sm font-semibold">Agora</h3>
          <div className="grid grid-cols-3 gap-2">
            <Card t="Em aberto" v={r.abertas.length} sub="abertas ou em serviço" onClick={() => setLista('abertas')} ativo={lista === 'abertas'} />
            <Card t="Prontas, esperando buscar" v={r.prontas.length} tom={r.prontas.length ? 'text-amber-500' : ''} onClick={() => setLista('prontas')} ativo={lista === 'prontas'} />
            <Card t="Atrasadas" v={r.atrasadas.length} sub="previsão de entrega vencida" tom={r.atrasadas.length ? 'text-red-500' : ''} onClick={() => setLista('atrasadas')} ativo={lista === 'atrasadas'} />
          </div>
          <section className="rounded-xl border bg-card p-3 space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">{lista === 'prontas' ? 'Prontas esperando o cliente' : lista === 'atrasadas' ? 'Atrasadas' : 'Em aberto (mais antigas primeiro)'}</h3>
              <Button size="sm" variant="outline" className="ml-auto" disabled={itensLista.length === 0}
                onClick={() => baixarPlanilha(`oficina-${lista}`, ['Cliente', 'Telefone', 'Veículo', 'Mecânico', 'Abertura', lista === 'atrasadas' ? 'Previsão' : 'Dias', lista === 'atrasadas' ? 'Dias de atraso' : ''],
                  itensLista.map(({ o, dias }) => [o.client_name, o.client_phone ?? '', veiculo(o), nomeMec(o.mechanic_id), new Date(o.created_at).toLocaleDateString('pt-BR'),
                    lista === 'atrasadas' ? deIso(o.previsao_entrega!).toLocaleDateString('pt-BR') : Math.floor(dias), lista === 'atrasadas' ? dias : '']))}>
                Baixar planilha
              </Button>
            </div>
            {itensLista.length === 0 ? <p className="text-xs text-muted-foreground">Nenhuma.</p> : itensLista.slice(0, 50).map(({ o, dias }) => (
              <div key={o.id} role={onOpenOrder ? 'button' : undefined} onClick={onOpenOrder ? () => onOpenOrder(o.id) : undefined}
                className={cn('flex justify-between gap-2 border-t border-border/50 pt-1 text-xs first:border-t-0 first:pt-0', onOpenOrder && 'cursor-pointer rounded hover:bg-muted/60')}>
                <div className="min-w-0">
                  <p className="font-medium truncate">{o.client_name} <span className="text-muted-foreground">· {veiculo(o)}</span></p>
                  <p className="text-muted-foreground">{nomeMec(o.mechanic_id)}{o.client_phone ? ` · ${o.client_phone}` : ''}</p>
                </div>
                <span className={cn('flex-shrink-0 text-right', lista !== 'abertas' && dias >= 3 && 'text-red-500')}>
                  {lista === 'prontas' ? `pronta há ${duracao(dias * DIA)}` : lista === 'atrasadas' ? `${dias} dia${dias === 1 ? '' : 's'} de atraso` : `aberta há ${duracao(dias * DIA)}`}
                </span>
              </div>
            ))}
            {itensLista.length > 50 && <p className="text-[11px] text-muted-foreground">Mostrando 50 de {itensLista.length}. A planilha tem todas.</p>}
          </section>

          <h3 className="pt-2 text-sm font-semibold">No período</h3>
          <BarraPeriodo p={per} />
          {problemaNoPeriodo(atual) ? (
            <p className="rounded-xl border p-4 text-center text-sm text-muted-foreground">{problemaNoPeriodo(atual)}</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Card t="Entraram" v={r.entraram} sub="OS abertas no período" />
                <Card t="Entregues" v={r.entregues} sub="saíram no período" />
                <Card t="Tempo na oficina" v={r.entregues ? duracao(r.mediana) : '—'} sub={r.entregues ? `metade sai em até isso · média ${duracao(r.media)}` : 'nenhuma entregue'} />
                <Card t="Entregue no prazo" v={r.prazo ? `${Math.round((r.prazo.cumpriu / r.prazo.total) * 100)}%` : '—'} sub={r.prazo ? `${r.prazo.cumpriu} de ${r.prazo.total} com previsão` : 'nenhuma com previsão'} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <section className="rounded-xl border bg-card p-3 space-y-1">
                  <h3 className="text-sm font-semibold">Por mecânico</h3>
                  {r.mecanicos.length === 0 ? <p className="text-xs text-muted-foreground">Nada no período.</p> : r.mecanicos.map(([nome, g]) => (
                    <div key={nome} className="flex justify-between gap-2 border-t border-border/50 pt-1 text-xs first:border-t-0 first:pt-0">
                      <span>{nome} <span className="text-muted-foreground">· {g.entregues} entregue{g.entregues === 1 ? '' : 's'}{g.tempos.length ? ` · ${duracao(mediana(g.tempos))}` : ''}</span></span>
                      <span className="text-muted-foreground">{g.notas.length ? `nota ${(g.notas.reduce((s, n) => s + n, 0) / g.notas.length).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} (${g.notas.length})` : 'sem avaliação'}</span>
                    </div>
                  ))}
                </section>
                <section className="rounded-xl border bg-card p-3 space-y-1">
                  <h3 className="text-sm font-semibold">Marcas mais atendidas</h3>
                  {r.veiculos.length === 0 ? <p className="text-xs text-muted-foreground">Nada no período.</p> : r.veiculos.map(([v, n]) => (
                    <div key={v} className="flex justify-between gap-2 border-t border-border/50 pt-1 text-xs first:border-t-0 first:pt-0">
                      <span>{v}</span><span className="tabular-nums">{n} OS</span>
                    </div>
                  ))}
                </section>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Tempo na oficina = da abertura da OS até a conclusão, das entregues no período. Marca vem do veículo cadastrado (ou da primeira palavra do equipamento).
                Nota = média da avaliação do serviço respondida no período.
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
