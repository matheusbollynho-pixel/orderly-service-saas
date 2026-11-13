// v2: Resumo novo dos Relatórios. A conta fecha na tela:
// Vendeu − Ficou a receber = Recebido dessas vendas; Entradas = soma das origens (igual ao Caixa);
// Saldo do caixa = Entradas − Saídas (retirada fica fora, como no Caixa).
import { useState } from 'react';
import { AlertTriangle, Eye, EyeOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useRelatorioResumo, type ResumoDados } from '@/hooks/useRelatorioResumo';
import { deIso, rotuloPeriodo } from '@/lib/periodo';
import { BarraPeriodo, usePeriodo } from './BarraPeriodo';

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function variacao(atual: number, anterior?: number) {
  if (anterior === undefined) return null;
  if (anterior === 0) return atual === 0 ? '=' : 'novo';
  const p = Math.round(((atual - anterior) / Math.abs(anterior)) * 100);
  return `${p > 0 ? '+' : ''}${p}%`;
}

export const vendeu = (d: ResumoDados) => d.os.total - d.os.desconto + d.notas.total;
export const ficouAReceber = (d: ResumoDados) => d.os.a_receber + d.notas.no_fiado;
export const lancadoAMao = (d: ResumoDados) =>
  Math.max(Math.round((d.caixa.entradas - d.caixa.entradas_os - d.caixa.entradas_notas - d.caixa.entradas_fiado - d.caixa.entradas_estorno) * 100) / 100, 0);

export default function ResumoV2() {
  const per = usePeriodo('mes');
  const { atual, anterior } = per.escolhido;
  const { data: d, isLoading, isError, error, refetch } = useRelatorioResumo(atual);
  const { data: ant } = useRelatorioResumo(anterior);
  const [oculto, setOculto] = useState(true);
  const v = (n: number) => (oculto ? 'R$ ••••' : brl(n));

  const Bloco = ({ titulo, valor, comparar, tom, children }: { titulo: string; valor?: number; comparar?: number; tom?: string; children?: React.ReactNode }) => (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</p>
        {valor !== undefined && (
          <div className="text-right">
            <p className={cn('font-display text-xl font-bold tabular-nums', tom)}>{v(valor)}</p>
            {!oculto && variacao(valor, comparar) && <p className="text-[11px] text-muted-foreground">{variacao(valor, comparar)} vs {rotuloPeriodo(anterior)}</p>}
          </div>
        )}
      </div>
      {children && <div className="mt-2 space-y-1 text-sm">{children}</div>}
    </div>
  );
  const Linha = ({ nome, valor, tom, forte }: { nome: string; valor: number; tom?: string; forte?: boolean }) => (
    <div className="flex items-center justify-between gap-2">
      <span className={cn('text-muted-foreground', forte && 'font-semibold text-foreground')}>{nome}</span>
      <span className={cn('tabular-nums', forte && 'font-semibold', tom)}>{v(valor)}</span>
    </div>
  );

  return (
    <div className="space-y-3">
      <BarraPeriodo p={per} />
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" className="h-10 gap-2" onClick={() => setOculto((o) => !o)}>
          {oculto ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}{oculto ? 'Mostrar valores' : 'Esconder valores'}
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
      ) : isError || !d ? (
        <div className="space-y-2 rounded-xl border border-border p-4 text-sm">
          <p>Não consegui calcular o resumo.</p>
          {error instanceof Error && <p className="text-xs text-muted-foreground">{error.message}</p>}
          <Button variant="outline" onClick={() => refetch()}>Tentar de novo</Button>
        </div>
      ) : (
        <>
          <Bloco titulo="Vendeu" valor={vendeu(d)} comparar={ant ? vendeu(ant) : undefined}>
            <Linha nome={`${d.os.qtd} OS entregue${d.os.qtd === 1 ? '' : 's'}`} valor={d.os.total - d.os.desconto} />
            {d.notas.qtd > 0 && <Linha nome={`${d.notas.qtd} nota${d.notas.qtd === 1 ? '' : 's'} do balcão`} valor={d.notas.total} />}
            <div className="my-1 border-t border-border/60" />
            <Linha nome="Ficou a receber" valor={ficouAReceber(d)} tom={ficouAReceber(d) > 0 ? 'text-amber-500' : undefined} />
            <Linha nome="Recebido dessas vendas" valor={vendeu(d) - ficouAReceber(d)} />
          </Bloco>

          <Bloco titulo="Entradas (igual ao Caixa)" valor={d.caixa.entradas} comparar={ant?.caixa.entradas} tom="text-green-500">
            <Linha nome="Pagamentos de OS" valor={d.caixa.entradas_os} />
            {d.caixa.entradas_notas > 0 && <Linha nome="Notas do balcão" valor={d.caixa.entradas_notas} />}
            {d.caixa.entradas_fiado > 0 && <Linha nome="Fiado recebido" valor={d.caixa.entradas_fiado} />}
            <Linha nome="Lançado à mão no caixa" valor={lancadoAMao(d)} />
            {d.caixa.entradas_estorno > 0 && <Linha nome="Estorno de saída" valor={d.caixa.entradas_estorno} />}
          </Bloco>

          <Bloco titulo="Saídas (igual ao Caixa)" valor={d.caixa.saidas} comparar={ant?.caixa.saidas}>
            {d.caixa.retiradas > 0 && <p className="text-xs text-muted-foreground">Retiradas: {v(d.caixa.retiradas)} (ficam fora do saldo, como no Caixa)</p>}
          </Bloco>

          <Bloco titulo="Saldo do caixa" valor={d.caixa.entradas - d.caixa.saidas} comparar={ant ? ant.caixa.entradas - ant.caixa.saidas : undefined}>
            <p className="text-xs text-muted-foreground">Entradas − Saídas. Não é lucro: comissão e custos ficam pra área de Financeiro.</p>
          </Bloco>

          <Bloco titulo="Pra pagar">
            <Linha nome={`${d.pra_pagar.qtd} conta${d.pra_pagar.qtd === 1 ? '' : 's'} até ${d.pra_pagar.ate ? rotuloPeriodo({ ini: d.pra_pagar.ate, fim: d.pra_pagar.ate }) : 'o fim do mês'}`} valor={d.pra_pagar.valor} tom={d.pra_pagar.valor > 0 ? 'text-amber-500' : undefined} />
            {d.pra_pagar.vencidas > 0 && <p className="text-xs font-semibold text-red-500">{d.pra_pagar.vencidas} já vencida{d.pra_pagar.vencidas === 1 ? '' : 's'}</p>}
          </Bloco>

          {(d.caixa.estornos_qtd > 0 || d.descontos.os + d.descontos.notas > 0 || d.fiado_vencido.qtd > 0) && (
            <Bloco titulo="Atenção">
              {d.caixa.estornos_qtd > 0 && <Linha nome={`${d.caixa.estornos_qtd} estorno${d.caixa.estornos_qtd === 1 ? '' : 's'}`} valor={d.caixa.estornos_valor} tom="text-red-500" />}
              {d.descontos.os + d.descontos.notas > 0 && <Linha nome="Descontos dados" valor={d.descontos.os + d.descontos.notas} />}
              {d.fiado_vencido.qtd > 0 && <Linha nome={`Fiado vencido (${d.fiado_vencido.qtd})`} valor={d.fiado_vencido.valor} tom="text-red-500" />}
              <p className="flex items-center gap-1 pt-1 text-[11px] text-muted-foreground"><AlertTriangle className="h-3 w-3" />Fiado vencido é de hoje, não do período.</p>
            </Bloco>
          )}
          {!ant && <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />carregando comparação…</p>}
          <p className="text-center text-[11px] text-muted-foreground">Conta direto no banco, com todas as OS do período ({deIso(atual.ini).toLocaleDateString('pt-BR')} a {deIso(atual.fim).toLocaleDateString('pt-BR')}).</p>
        </>
      )}
    </div>
  );
}
