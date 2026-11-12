// v2: Início. O que importa no dia, com um toque para agir. Celular primeiro.
import { useEffect, useState } from 'react';
import { CalendarDays, ChevronRight, Eye, EyeOff, HandCoins, Plus, ShoppingCart, Wallet, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useAppointments } from '@/hooks/useAppointments';
import { useCashFlow } from '@/hooks/useCashFlow';
import { useAReceber, useContagemOS } from '@/hooks/useAReceber';
import type { Acesso, View } from '@/lib/navegacao';
import type { OrderStatus, ServiceOrder } from '@/types/service-order';

export const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const hojeISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza' }).format(new Date());

function Bloco({ titulo, icone: Icone, acao, onClick, children }: {
  titulo: string; icone: typeof Wallet; acao?: string; onClick?: () => void; children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card">
      <button type="button" onClick={onClick} disabled={!onClick}
        className="flex min-h-[48px] w-full items-center justify-between gap-2 px-4 pt-3 text-left">
        <span className="flex items-center gap-2 text-sm font-semibold text-muted-foreground"><Icone className="h-4 w-4" />{titulo}</span>
        {onClick && <span className="flex items-center text-xs text-muted-foreground">{acao ?? 'Ver'}<ChevronRight className="h-4 w-4" /></span>}
      </button>
      <div className="px-4 pb-4 pt-1">{children}</div>
    </section>
  );
}

export default function InicioPage({ orders, carregando, acessoDe, goTo, filtrarOrdens, abrirReceber, recentes }: {
  orders: ServiceOrder[];
  carregando: boolean;
  acessoDe: (v: View) => Acesso;
  goTo: (v: View) => void;
  filtrarOrdens: (s: OrderStatus) => void;
  abrirReceber: () => void;
  recentes?: React.ReactNode;
}) {
  const hoje = hojeISO();
  const podeCaixa = acessoDe('fluxo-caixa') === 'ok';
  const podeAgenda = acessoDe('agenda') === 'ok';
  const podeReceber = podeCaixa || acessoDe('fiados') === 'ok';

  const { appointments, isLoading: carregandoAgenda } = useAppointments(hoje, hoje);
  const { summary } = useCashFlow(hoje);
  const { data: aReceber } = useAReceber(podeReceber);

  // Olho do caixa: começa escondido e volta a esconder ao sair do Início (tela pode estar virada pro cliente)
  const [verCaixa, setVerCaixa] = useState(false);
  useEffect(() => () => setVerCaixa(false), []);

  const { data: contagem } = useContagemOS();
  // Conta no banco; enquanto carrega, usa as OS que a tela já tem
  const conta = (s: OrderStatus) => contagem?.[s] ?? orders.filter((o) => o.status === s).length;
  const etapas: { s: OrderStatus; nome: string; cor: string }[] = [
    { s: 'aberta', nome: 'Abertas', cor: 'text-foreground' },
    { s: 'em_andamento', nome: 'Em serviço', cor: 'text-amber-500' },
    { s: 'concluida', nome: 'Prontas', cor: 'text-green-500' },
  ];
  const agendaHoje = appointments.filter((a) => a.status !== 'cancelado');
  const fiadosVencidos = aReceber?.fiados.filter((f) => f.vencido) ?? [];
  const totalProntas = aReceber?.prontas.reduce((s, x) => s + x.falta, 0) ?? 0;

  return (
    <div className="space-y-4">
      {/* Ações do dia */}
      <div className="grid grid-cols-2 gap-2">
        {acessoDe('new') === 'ok' && <Button className="h-14 text-base" onClick={() => goTo('new')}><Plus className="h-5 w-5" /> Nova OS</Button>}
        {acessoDe('express') === 'ok' && <Button variant="outline" className="h-14 text-base" onClick={() => goTo('express')}><Zap className="h-5 w-5" /> Express</Button>}
        {acessoDe('balcao') !== 'sem_permissao' && <Button variant="outline" className="h-14 text-base" onClick={() => goTo('balcao')}><ShoppingCart className="h-5 w-5" /> Vender</Button>}
        {podeReceber && <Button variant="outline" className="h-14 text-base" onClick={abrirReceber}><HandCoins className="h-5 w-5" /> Receber</Button>}
      </div>

      {/* Motos por etapa */}
      <Bloco titulo="Na oficina" icone={CalendarDays} acao="Ordens" onClick={() => goTo('orders')}>
        {carregando ? <Skeleton className="h-16" /> : (
          <div className="grid grid-cols-3 gap-2">
            {etapas.map(({ s, nome, cor }) => (
              <button key={s} type="button" onClick={() => filtrarOrdens(s)}
                className="flex min-h-[64px] flex-col items-center justify-center rounded-lg bg-muted/40 hover:bg-muted/70">
                <span className={cn('font-display text-2xl font-bold tabular-nums', cor)}>{conta(s)}</span>
                <span className="text-xs text-muted-foreground">{nome}</span>
              </button>
            ))}
          </div>
        )}
      </Bloco>

      {/* A receber */}
      {podeReceber && (
        <Bloco titulo="A receber" icone={HandCoins} acao="Ver tudo" onClick={abrirReceber}>
          {!aReceber ? <Skeleton className="h-12" /> : (
            <div className="space-y-1 text-sm">
              <p className="flex justify-between"><span>Prontas esperando pagar</span><span className="font-semibold tabular-nums">{aReceber.prontas.length} · {verCaixa ? brl(totalProntas) : 'R$ •••'}</span></p>
              <p className={cn('flex justify-between', fiadosVencidos.length && 'text-red-500')}><span>Fiados vencidos</span><span className="font-semibold tabular-nums">{fiadosVencidos.length}</span></p>
              <p className="flex justify-between"><span>Notas de balcão abertas</span><span className="font-semibold tabular-nums">{aReceber.notas.length}</span></p>
            </div>
          )}
        </Bloco>
      )}

      {/* Caixa de hoje (com olho) */}
      {podeCaixa && (
        <Bloco titulo="Caixa de hoje" icone={Wallet} acao="Abrir caixa" onClick={() => goTo('fluxo-caixa')}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Entrou hoje</p>
              <p className="font-display text-3xl font-bold tabular-nums text-green-500">
                {verCaixa ? brl(Number(summary?.total_entradas ?? 0)) : 'R$ •••••'}
              </p>
            </div>
            <Button variant="outline" size="icon" className="h-12 w-12" aria-label={verCaixa ? 'Esconder valores' : 'Mostrar valores'}
              onClick={() => setVerCaixa((v) => !v)}>
              {verCaixa ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </Button>
          </div>
        </Bloco>
      )}

      {/* Agenda de hoje */}
      {podeAgenda && (
        <Bloco titulo={`Agenda de hoje${agendaHoje.length ? ` · ${agendaHoje.length}` : ''}`} icone={CalendarDays} acao="Agenda" onClick={() => goTo('agenda')}>
          {carregandoAgenda ? <Skeleton className="h-10" /> : agendaHoje.length === 0
            ? <p className="text-sm text-muted-foreground">Nenhum agendamento hoje.</p>
            : (
              <ul className="space-y-1 text-sm">
                {agendaHoje.slice(0, 3).map((a) => (
                  <li key={a.id} className="flex gap-2">
                    <span className="w-12 shrink-0 tabular-nums text-muted-foreground">{a.appointment_time?.slice(0, 5) || '—'}</span>
                    <span className="truncate"><b>{a.client_name}</b>{a.service_description ? ` · ${a.service_description}` : ''}</span>
                  </li>
                ))}
                {agendaHoje.length > 3 && <li className="text-xs text-muted-foreground">e mais {agendaHoje.length - 3}…</li>}
              </ul>
            )}
        </Bloco>
      )}

      {recentes}
    </div>
  );
}
