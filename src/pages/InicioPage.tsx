// v2: Início. O que importa no dia, com um toque para agir. Celular primeiro.
import { CalendarDays, ChevronRight, HandCoins, Plus, ShoppingCart, Wallet, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useAppointments } from '@/hooks/useAppointments';
import { useOficinaAtivas } from '@/hooks/useOficina';
import { etapaDe, type Etapa } from '@/lib/etapaOS';
import type { Acesso, View } from '@/lib/navegacao';
import type { ServiceOrder } from '@/types/service-order';

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

export default function InicioPage({ orders, carregando, acessoDe, goTo, abrirOficina, abrirReceber, recentes }: {
  orders: ServiceOrder[];
  carregando: boolean;
  acessoDe: (v: View) => Acesso;
  goTo: (v: View) => void;
  abrirOficina: (etapa: Etapa) => void;
  abrirReceber: () => void;
  recentes?: React.ReactNode;
}) {
  const hoje = hojeISO();
  const podeAgenda = acessoDe('agenda') === 'ok';
  const podeReceber = acessoDe('fluxo-caixa') === 'ok' || acessoDe('fiados') === 'ok';

  const { appointments, isLoading: carregandoAgenda } = useAppointments(hoje, hoje);


  // Mesma conta do Quadro (etapa da moto), com TODAS as ativas do banco
  const { data: ativas, isLoading: carregandoAtivas } = useOficinaAtivas();
  const conta = (e: Etapa) => (ativas ?? orders.filter((o) => o.status !== 'concluida_entregue')).filter((o) => etapaDe(o) === e).length;
  const etapas: { s: Etapa; nome: string; cor: string }[] = [
    { s: 'fila', nome: 'Na fila', cor: 'text-foreground' },
    { s: 'servico', nome: 'Em serviço', cor: 'text-blue-500' },
    { s: 'pronta', nome: 'Prontas', cor: 'text-green-500' },
  ];
  const agendaHoje = appointments.filter((a) => a.status !== 'cancelado');

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
      <Bloco titulo="Na oficina" icone={CalendarDays} acao="Quadro" onClick={() => goTo('quadro')}>
        {carregando && carregandoAtivas ? <Skeleton className="h-16" /> : (
          <div className="grid grid-cols-3 gap-2">
            {etapas.map(({ s, nome, cor }) => (
              <button key={s} type="button" onClick={() => abrirOficina(s)}
                className="flex min-h-[64px] flex-col items-center justify-center rounded-lg bg-muted/40 hover:bg-muted/70">
                <span className={cn('font-display text-2xl font-bold tabular-nums', cor)}>{conta(s)}</span>
                <span className="text-xs text-muted-foreground">{nome}</span>
              </button>
            ))}
          </div>
        )}
      </Bloco>

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
