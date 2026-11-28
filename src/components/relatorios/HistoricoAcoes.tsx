// Relatórios › Histórico (só o dono): quem cancelou, deu desconto, estornou, mexeu no estoque,
// excluiu OS/item/fiado, devolveu item e liberou fiado. Gravado pelo banco, não depende da tela.
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { buscarTodas } from '@/lib/buscarTodas';
import { useStore } from '@/contexts/StoreContext';
import { baixarPlanilha } from '@/lib/planilha';
import { deIso, iso, problemaNoPeriodo } from '@/lib/periodo';
import { matchesSearch } from '@/lib/textSearch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { BarraPeriodo, usePeriodo } from './BarraPeriodo';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataHora = (s: string) => new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });

export const TIPOS_HISTORICO: { id: string; nome: string; cor: string }[] = [
  { id: 'cancelamento', nome: 'Cancelamentos', cor: 'text-red-500' },
  { id: 'desconto', nome: 'Descontos', cor: 'text-amber-500' },
  { id: 'pagamento', nome: 'Pagamentos alterados', cor: 'text-amber-500' },
  { id: 'estorno', nome: 'Estornos', cor: 'text-red-500' },
  { id: 'estoque', nome: 'Estoque', cor: 'text-blue-500' },
  { id: 'exclusao', nome: 'Exclusões', cor: 'text-red-500' },
  { id: 'devolucao', nome: 'Devoluções', cor: 'text-orange-500' },
  { id: 'fiado', nome: 'Fiado', cor: 'text-purple-500' },
];
interface Acao { id: number; quando: string; quem: string | null; tipo: string; acao: string; valor: number | null }

export default function HistoricoAcoes() {
  const { storeId, isOwner } = useStore();
  const per = usePeriodo('mes');
  const { atual } = per.escolhido;
  const [tipo, setTipo] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const { data = [], isLoading } = useQuery({
    queryKey: ['historico-acoes', storeId, atual.ini, atual.fim],
    enabled: !!storeId && isOwner && !problemaNoPeriodo(atual),
    queryFn: async () => {
      const fim = deIso(atual.fim); fim.setDate(fim.getDate() + 1);
      return buscarTodas<Acao>((a, b) => db.from('historico_acoes').select('id, quando, quem, tipo, acao, valor')
        .eq('store_id', storeId).gte('quando', `${atual.ini}T00:00:00-03:00`).lt('quando', `${iso(fim)}T00:00:00-03:00`)
        .order('quando', { ascending: false }).order('id', { ascending: false }).range(a, b));
    },
  });
  const visiveis = useMemo(() => data.filter((x) => (!tipo || x.tipo === tipo)
    && (!busca.trim() || matchesSearch(busca.trim().toLowerCase(), x.quem, x.acao))), [data, tipo, busca]);
  const contagem = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of data) m.set(x.tipo, (m.get(x.tipo) ?? 0) + 1);
    return m;
  }, [data]);

  if (!isOwner) return <p className="rounded-xl border p-4 text-center text-sm text-muted-foreground">Só o dono da loja vê o histórico.</p>;

  return (
    <div className="space-y-3">
      <BarraPeriodo p={per} />
      <div className="flex flex-wrap gap-1">
        <Button size="sm" variant={!tipo ? 'default' : 'outline'} onClick={() => setTipo(null)}>Tudo ({data.length})</Button>
        {TIPOS_HISTORICO.filter((t) => contagem.get(t.id)).map((t) => (
          <Button key={t.id} size="sm" variant={tipo === t.id ? 'default' : 'outline'} onClick={() => setTipo(t.id)}>{t.nome} ({contagem.get(t.id)})</Button>
        ))}
      </div>
      <div className="flex gap-2">
        <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por pessoa, cliente, produto..." />
        <Button variant="outline" disabled={!visiveis.length} onClick={() => baixarPlanilha(`historico-${atual.ini}-a-${atual.fim}`,
          ['Quando', 'Quem', 'Tipo', 'O que', 'Valor'],
          visiveis.map((x) => [dataHora(x.quando), x.quem ?? '', TIPOS_HISTORICO.find((t) => t.id === x.tipo)?.nome ?? x.tipo, x.acao, x.valor ?? '']))}>
          Planilha
        </Button>
      </div>
      {isLoading ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : !visiveis.length ? (
        <p className="rounded-xl border p-4 text-center text-sm text-muted-foreground">Nada registrado no período. O histórico começou em 28/11/2026.</p>
      ) : (
        <div className="space-y-1.5">
          {visiveis.map((x) => {
            const t = TIPOS_HISTORICO.find((y) => y.id === x.tipo);
            return (
              <div key={x.id} className="rounded-lg border border-border px-3 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm text-foreground">{x.acao}</p>
                  {x.valor != null && <span className="text-sm font-semibold tabular-nums shrink-0">{brl(Number(x.valor))}</span>}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {dataHora(x.quando)} · <span className="text-foreground">{x.quem ?? '—'}</span> · <span className={t?.cor}>{t?.nome ?? x.tipo}</span>
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
