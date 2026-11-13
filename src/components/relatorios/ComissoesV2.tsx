// v2: aba Comissões — o acerto da semana. Por pessoa: Comissão − Vales + saldo anterior = A pagar.
// "Marcar pago" fecha a semana (vales descontados, serviços marcados pagos). Negativo passa pra próxima.
import { useState } from 'react';
import { CheckCircle2, Eye, EyeOff, Loader2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { rotuloPeriodo } from '@/lib/periodo';
import { useStore } from '@/contexts/StoreContext';
import { useAcertoAcoes, useComissoes, useDiaAcerto, type LinhaComissao } from '@/hooks/useComissoes';
import { confirmar, pedirTexto } from '@/components/v2/Confirmacao';
import { BarraPeriodo, usePeriodo } from './BarraPeriodo';

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

export default function ComissoesV2() {
  const { isOwner } = useStore();
  const { dia, salvar } = useDiaAcerto();
  const per = usePeriodo('semana', dia);
  const { atual } = per.escolhido;
  const { data: linhas = [], isLoading, isError, error, refetch } = useComissoes(atual);
  const { fechar, desfazer } = useAcertoAcoes();
  const [oculto, setOculto] = useState(true);
  const v = (n: number) => (oculto ? 'R$ ••••' : brl(n));

  const marcarPago = async (l: LinhaComissao) => {
    const ok = await confirmar({
      titulo: `Fechar o acerto de ${l.nome}?`,
      descricao: `${rotuloPeriodo(atual)} · Comissão ${brl(l.comissao)} − Vales ${brl(l.vales)}${l.saldo_anterior ? ` + saldo anterior ${brl(l.saldo_anterior)}` : ''} = ${l.a_pagar >= 0 ? `pagar ${brl(l.a_pagar)}` : `ele fica devendo ${brl(-l.a_pagar)} (passa pra próxima semana)`}. Os vales saem da lista e os serviços ficam marcados pagos.`,
      verbo: 'Fechar acerto',
    });
    if (ok) fechar.mutate({ l, p: atual });
  };
  const pedirDesfazer = async (id: string, nome: string) => {
    const motivo = await pedirTexto({ titulo: `Desfazer o acerto de ${nome}?`, descricao: 'Os vales e serviços voltam a ficar em aberto. Por quê? (fica registrado)', obrigatorio: true, verbo: 'Desfazer' });
    if (motivo?.trim()) desfazer.mutate({ id, motivo: motivo.trim() });
  };

  return (
    <div className="space-y-3">
      <BarraPeriodo p={per} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        {isOwner ? (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Semana fecha no
            <select value={dia} onChange={(e) => salvar.mutate(Number(e.target.value))} className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground">
              {DIAS.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </select>
          </label>
        ) : <span className="text-xs text-muted-foreground">Semana fecha no {DIAS[dia]}</span>}
        <Button variant="ghost" size="sm" className="h-10 gap-2" onClick={() => setOculto((o) => !o)}>
          {oculto ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}{oculto ? 'Mostrar valores' : 'Esconder valores'}
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-32 rounded-xl" />)}</div>
      ) : isError ? (
        <div className="space-y-2 rounded-xl border border-border p-4 text-sm">
          <p>Não consegui calcular as comissões.</p>
          {error instanceof Error && <p className="text-xs text-muted-foreground">{error.message}</p>}
          <Button variant="outline" onClick={() => refetch()}>Tentar de novo</Button>
        </div>
      ) : linhas.length === 0 ? (
        <p className="rounded-xl border border-border p-6 text-center text-sm text-muted-foreground">Ninguém com comissão ou vale nesse período.</p>
      ) : (
        linhas.map((l) => {
          const a = l.acerto;
          const Linha = ({ nome, valor, tom }: { nome: string; valor: number; tom?: string }) => (
            <div className="flex items-center justify-between gap-2 text-sm"><span className="text-muted-foreground">{nome}</span><span className={cn('tabular-nums', tom)}>{v(valor)}</span></div>
          );
          const comissao = a ? a.comissao : l.comissao, vales = a ? a.vales : l.vales, saldo = a ? a.saldo_anterior : l.saldo_anterior, aPagar = a ? a.a_pagar : l.a_pagar;
          return (
            <div key={`${l.tipo}${l.id}`} className={cn('rounded-xl border bg-card p-4', a ? 'border-green-500/40' : 'border-border')}>
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <p className="text-base font-bold leading-tight">{l.nome}</p>
                  <p className="text-xs text-muted-foreground">{l.tipo === 'm' ? 'Mecânico' : 'Balcão'} · {a ? a.taxa : l.taxa}%</p>
                </div>
                {a && <span className="flex items-center gap-1 rounded-full border border-green-500/40 bg-green-500/10 px-2 py-1 text-xs font-semibold text-green-500"><CheckCircle2 className="h-3.5 w-3.5" />Pago {new Date(a.pago_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>}
              </div>
              <div className="space-y-1">
                <Linha nome={`Comissão (${l.tipo === 'm' ? 'serviços' : 'vendas'} ${oculto ? '' : brl(a ? a.base : l.base)})`} valor={comissao} />
                {!a && l.ja_pago > 0 && <p className="text-[11px] text-muted-foreground">Fora da conta: {v(l.ja_pago)} em serviços já marcados pagos antes.</p>}
                {vales > 0 && <Linha nome={`Vales${!a && l.qtd_vales ? ` (${l.qtd_vales})` : ''}`} valor={-vales} tom="text-amber-500" />}
                {saldo !== 0 && <Linha nome="Saldo da semana anterior" valor={saldo} tom="text-red-500" />}
                <div className="my-1 border-t border-border/60" />
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{aPagar >= 0 ? (a ? 'Pago' : 'A pagar') : 'Ficou devendo'}</span>
                  <span className={cn('font-display text-xl font-bold tabular-nums', aPagar < 0 && 'text-red-500')}>{v(Math.abs(aPagar))}</span>
                </div>
                {aPagar < 0 && !a && <p className="text-[11px] text-muted-foreground">Passa pra próxima semana.</p>}
              </div>
              <div className="mt-3">
                {a ? (
                  <Button variant="ghost" size="sm" className="h-10 gap-1 text-muted-foreground" disabled={desfazer.isPending} onClick={() => pedirDesfazer(a.id, l.nome)}>
                    <Undo2 className="h-4 w-4" />Desfazer acerto
                  </Button>
                ) : (
                  <Button className="h-12 w-full" disabled={fechar.isPending || (l.comissao === 0 && l.vales === 0 && l.saldo_anterior === 0)} onClick={() => marcarPago(l)}>
                    {fechar.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Marcar pago'}
                  </Button>
                )}
              </div>
            </div>
          );
        })
      )}
      <p className="text-center text-[11px] text-muted-foreground">Conta no banco. Serviço concluído depois de um acerto entra no próximo.</p>
    </div>
  );
}
