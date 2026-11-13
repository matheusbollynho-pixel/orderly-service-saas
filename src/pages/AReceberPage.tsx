// v2: "A receber" — OS prontas com saldo, entregues sem quitar, fiados e notas abertas.
// Tocar numa linha abre onde se recebe (a gravação continua em cada tela).
import { useState } from 'react';
import { ChevronRight, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { matchesSearch } from '@/lib/textSearch';
import { useAReceber } from '@/hooks/useAReceber';
import { brl } from './InicioPage';
import type { ServiceOrder } from '@/types/service-order';

const dataCurta = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().slice(0, 2).join('/') : '');

export default function AReceberPage({ abrirOS, abrirFiados, abrirNota, mostrarFiados, mostrarNotas }: {
  abrirOS: (os: ServiceOrder) => void;
  abrirFiados: (fiadoId?: string) => void;
  abrirNota: (id: string) => void;
  mostrarFiados: boolean;
  mostrarNotas: boolean;
}) {
  const { data, isLoading, isError, refetch } = useAReceber(true);
  const [busca, setBusca] = useState('');
  const [ver, setVer] = useState(false);
  const valor = (v: number) => (ver ? brl(v) : 'R$ •••');

  const Linha = ({ titulo, detalhe, v, alerta, onClick }: { titulo: string; detalhe: string; v: number; alerta?: boolean; onClick: () => void }) => (
    <button type="button" onClick={onClick}
      className="flex min-h-[60px] w-full items-center justify-between gap-3 border-b border-border/60 px-4 py-2 text-left last:border-b-0 hover:bg-muted/40">
      <span className="min-w-0">
        <span className="block truncate font-medium">{titulo}</span>
        <span className={cn('block truncate text-xs', alerta ? 'text-red-500' : 'text-muted-foreground')}>{detalhe}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1 font-display text-lg font-bold tabular-nums">{valor(v)}<ChevronRight className="h-4 w-4 text-muted-foreground" /></span>
    </button>
  );

  const Grupo = ({ titulo, vazio, children, n }: { titulo: string; vazio: string; children: React.ReactNode; n: number }) => (
    <section className="space-y-2">
      <h3 className="px-1 text-sm font-semibold text-muted-foreground">{titulo}{n ? ` · ${n}` : ''}</h3>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {n ? children : <p className="p-4 text-sm text-muted-foreground">{vazio}</p>}
      </div>
    </section>
  );

  if (isLoading) return <div className="space-y-3"><Skeleton className="h-12" /><Skeleton className="h-40" /><Skeleton className="h-40" /></div>;
  if (isError || !data) return (
    <div className="space-y-3 rounded-xl border border-border p-4 text-sm">
      <p>Não consegui carregar o que há para receber.</p>
      <Button variant="outline" onClick={() => refetch()}>Tentar de novo</Button>
    </div>
  );

  const filtraOS = (l: typeof data.prontas) => l.filter((x) => matchesSearch(busca, x.os.client_name, x.os.equipment, x.os.client_phone));
  const prontas = filtraOS(data.prontas);
  const entregues = filtraOS(data.entreguesSemQuitar);
  const fiados = data.fiados.filter((f) => matchesSearch(busca, f.cliente));
  const notas = data.notas.filter((n) => matchesSearch(busca, n.cliente, String(n.numero ?? '')));
  const total = [...prontas, ...entregues].reduce((s, x) => s + x.falta, 0) + (mostrarFiados ? fiados.reduce((s, f) => s + f.falta, 0) : 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">A receber</h2>
          <p className="font-display text-2xl font-bold tabular-nums">{valor(total)}</p>
        </div>
        <Button variant="outline" size="icon" className="h-12 w-12" aria-label={ver ? 'Esconder valores' : 'Mostrar valores'} onClick={() => setVer((v) => !v)}>
          {ver ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
        </Button>
      </div>

      <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente, moto ou placa" className="h-12 text-base" />

      <Grupo titulo="Prontas, esperando pagar" vazio="Nenhuma OS pronta com saldo." n={prontas.length}>
        {prontas.map(({ os, falta }) => (
          <Linha key={os.id} titulo={os.client_name} detalhe={os.equipment || 'OS'} v={falta} onClick={() => abrirOS(os)} />
        ))}
      </Grupo>

      {mostrarFiados && (
        <Grupo titulo="Fiado" vazio="Nenhum fiado em aberto." n={fiados.length}>
          {fiados.map((f) => (
            <Linha key={f.id} titulo={f.cliente} v={f.falta} alerta={f.vencido}
              detalhe={f.vencimento ? `${f.vencido ? 'Venceu' : 'Vence'} ${dataCurta(f.vencimento)}` : 'Sem vencimento'}
              onClick={() => abrirFiados(f.id)} />
          ))}
        </Grupo>
      )}

      {mostrarNotas && (
        <Grupo titulo="Notas de balcão abertas" vazio="Nenhuma nota aberta." n={notas.length}>
          {notas.map((n) => (
            <button key={n.id} type="button" onClick={() => abrirNota(n.id)}
              className="flex min-h-[56px] w-full items-center justify-between gap-3 border-b border-border/60 px-4 text-left last:border-b-0 hover:bg-muted/40">
              <span className="min-w-0"><span className="block truncate font-medium">{n.cliente}</span>
                <span className="block text-xs text-muted-foreground">Nota #{n.numero ?? '—'} · aberta em {dataCurta(n.criada)}</span></span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
        </Grupo>
      )}

      <Grupo titulo="Entregues sem quitar" vazio="Nenhuma OS entregue com saldo." n={entregues.length}>
        {entregues.map(({ os, falta }) => (
          <Linha key={os.id} titulo={os.client_name} detalhe={`${os.equipment || 'OS'} · entregue`} v={falta} alerta onClick={() => abrirOS(os)} />
        ))}
      </Grupo>
    </div>
  );
}
