// Relatórios → Vencimentos: tudo que tem data num lugar só.
// Contas a pagar (Boletos), fiados a receber, lotes de produto vencendo,
// OS com previsão de entrega e encomendas que chegaram e o cliente não buscou.
// Vencidos aparecem sempre; "a vencer" até o horizonte escolhido.
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { baixarPlanilha } from '@/lib/planilha';
import { cn } from '@/lib/utils';

type Tipo = 'conta' | 'fiado' | 'lote' | 'os' | 'encomenda';

interface Item {
  id: string;
  tipo: Tipo;
  data: string;          // YYYY-MM-DD
  titulo: string;
  detalhe: string;
  valor: number | null;  // R$ (conta, fiado, lote pelo custo, encomenda)
  sentido: 'pagar' | 'receber' | 'estoque' | 'prazo';
}

const TIPOS: { id: Tipo; nome: string }[] = [
  { id: 'conta', nome: 'Contas a pagar' },
  { id: 'fiado', nome: 'Fiados a receber' },
  { id: 'lote', nome: 'Validade de produtos' },
  { id: 'os', nome: 'Entrega de OS' },
  { id: 'encomenda', nome: 'Encomendas' },
];
const CATEGORIA_CONTA: Record<string, string> = { fornecedor: 'Fornecedor', aluguel: 'Aluguel', conta_fixa: 'Conta fixa', imposto: 'Imposto', outro: 'Outro' };
const HORIZONTES = [7, 15, 30, 60];
const DIA = 86400000;
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmt = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('pt-BR');
const hojeISO = () => { const h = new Date(); h.setHours(0, 0, 0, 0); return h; };
const dias = (d: string) => Math.round((new Date(`${d}T00:00:00`).getTime() - hojeISO().getTime()) / DIA);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export default function Vencimentos() {
  const [horizonte, setHorizonte] = useState(15);
  const [situacao, setSituacao] = useState<'vencidos' | 'hoje' | 'proximos' | null>(null);
  const [tipos, setTipos] = useState<Set<Tipo>>(new Set(TIPOS.map((t) => t.id)));

  const { data: itens = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['relatorio-vencimentos'],
    queryFn: async () => {
      const [contas, fiados, lotes, ordens, encomendas] = await Promise.all([
        db.from('boletos').select('id, credor, valor, vencimento, categoria').is('paid_at', null).limit(2000),
        db.from('fiados').select('id, client_name, client_phone, original_amount, amount_paid, interest_accrued, due_date').neq('status', 'pago').limit(5000),
        db.from('inventory_lotes').select('id, lote, validade, quantidade, local, inventory_products(name, unit, cost_price)').gt('quantidade', 0).not('validade', 'is', null).limit(5000),
        db.from('service_orders').select('id, client_name, equipment, previsao_entrega, status').in('status', ['aberta', 'em_andamento']).not('previsao_entrega', 'is', null).limit(2000),
        db.from('encomendas').select('id, cliente_nome, peca, quantidade, preco_venda, pago_adiantado, chegou_em').eq('status', 'chegou').limit(2000),
      ]);
      for (const r of [contas, fiados, lotes, ordens, encomendas]) if (r.error) throw r.error;

      const lista: Item[] = [];
      for (const c of contas.data ?? []) {
        lista.push({ id: `c${c.id}`, tipo: 'conta', data: c.vencimento, titulo: c.credor, detalhe: CATEGORIA_CONTA[c.categoria] || c.categoria || '', valor: Number(c.valor) || 0, sentido: 'pagar' });
      }
      for (const f of fiados.data ?? []) {
        const saldo = Math.max(Number(f.original_amount || 0) + Number(f.interest_accrued || 0) - Number(f.amount_paid || 0), 0);
        if (saldo <= 0.005) continue;
        lista.push({ id: `f${f.id}`, tipo: 'fiado', data: f.due_date, titulo: f.client_name, detalhe: f.client_phone || '', valor: saldo, sentido: 'receber' });
      }
      for (const l of lotes.data ?? []) {
        const p = l.inventory_products || {};
        const q = Number(l.quantidade) || 0;
        lista.push({
          id: `l${l.id}`, tipo: 'lote', data: l.validade, titulo: p.name || 'Produto',
          detalhe: `lote ${l.lote || 'sem número'} · ${Number(q.toFixed(3)).toLocaleString('pt-BR')} ${(p.unit || '').toUpperCase()}${l.local === 'almox' ? ' · almoxarifado' : ''}`,
          valor: q * Number(p.cost_price || 0), sentido: 'estoque',
        });
      }
      for (const o of ordens.data ?? []) {
        if (o.equipment === '__QR_WALKIN_PLACEHOLDER__') continue;
        lista.push({ id: `o${o.id}`, tipo: 'os', data: o.previsao_entrega, titulo: o.client_name || 'OS', detalhe: `${o.equipment || ''} · ${o.status === 'aberta' ? 'aberta' : 'em serviço'}`, valor: null, sentido: 'prazo' });
      }
      for (const e of encomendas.data ?? []) {
        if (!e.chegou_em) continue;
        const falta = Math.max(Number(e.preco_venda || 0) * Number(e.quantidade || 1) - Number(e.pago_adiantado || 0), 0);
        lista.push({ id: `e${e.id}`, tipo: 'encomenda', data: String(e.chegou_em).slice(0, 10), titulo: e.cliente_nome, detalhe: `${e.peca} chegou, cliente ainda não buscou`, valor: falta || null, sentido: 'receber' });
      }
      return lista;
    },
  });

  const visiveis = useMemo(() => itens
    .filter((i) => tipos.has(i.tipo))
    .map((i) => ({ ...i, dias: dias(i.data) }))
    // Encomenda que chegou é sempre pendência (data = quando chegou)
    .filter((i) => i.tipo === 'encomenda' || i.dias <= horizonte)
    .sort((a, b) => (a.tipo === 'encomenda' ? -9999 : a.dias) - (b.tipo === 'encomenda' ? -9999 : b.dias) || a.data.localeCompare(b.data)),
  [itens, tipos, horizonte]);

  const soma = (lista: typeof visiveis, s: Item['sentido']) => lista.filter((i) => i.sentido === s).reduce((t, i) => t + (i.valor || 0), 0);
  const vencidos = visiveis.filter((i) => i.tipo !== 'encomenda' && i.dias < 0);
  const hoje = visiveis.filter((i) => i.tipo !== 'encomenda' && i.dias === 0);
  const aVencer = visiveis.filter((i) => i.tipo !== 'encomenda' && i.dias > 0);
  // Clicar num cartão mostra só aquele grupo na lista (clicar de novo volta tudo)
  const lista = situacao === 'vencidos' ? vencidos : situacao === 'hoje' ? hoje : situacao === 'proximos' ? aVencer : visiveis;

  const alternar = (t: Tipo) => setTipos((s) => { const n = new Set(s); if (n.has(t)) n.delete(t); else n.add(t); return n; });

  const rotuloDias = (i: (typeof visiveis)[number]) => {
    if (i.tipo === 'encomenda') return `chegou há ${-i.dias} dia${i.dias === -1 ? '' : 's'}`;
    if (i.dias < 0) return `vencido há ${-i.dias} dia${i.dias === -1 ? '' : 's'}`;
    if (i.dias === 0) return 'vence hoje';
    return `vence em ${i.dias} dia${i.dias === 1 ? '' : 's'}`;
  };

  const Resumo = ({ id, titulo, lista, cor }: { id: 'vencidos' | 'hoje' | 'proximos'; titulo: string; lista: typeof visiveis; cor?: string }) => (
    <button
      type="button"
      onClick={() => setSituacao((s) => (s === id ? null : id))}
      className={cn('rounded-xl border bg-card p-3 space-y-1 text-left transition-colors hover:border-primary/60',
        situacao === id && 'border-primary ring-1 ring-primary')}
    >
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p className={cn('text-lg font-bold', cor)}>{lista.length}</p>
      {soma(lista, 'pagar') > 0 && <p className="text-[11px]">a pagar {brl(soma(lista, 'pagar'))}</p>}
      {soma(lista, 'receber') > 0 && <p className="text-[11px]">a receber {brl(soma(lista, 'receber'))}</p>}
      {soma(lista, 'estoque') > 0 && <p className="text-[11px]">em produtos {brl(soma(lista, 'estoque'))}</p>}
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-sm text-muted-foreground mr-1">Vencidos + próximos:</span>
        {HORIZONTES.map((h) => (
          <Button key={h} size="sm" variant={horizonte === h ? 'default' : 'outline'} onClick={() => setHorizonte(h)}>{h} dias</Button>
        ))}
        <Button
          size="sm"
          variant="outline"
          className="ml-auto"
          disabled={lista.length === 0}
          onClick={() => baixarPlanilha(`vencimentos-${horizonte}-dias`,
            ['Data', 'Situação', 'Tipo', 'Quem / o quê', 'Detalhe', 'Valor', 'Sentido'],
            lista.map((i) => [fmt(i.data), rotuloDias(i), TIPOS.find((t) => t.id === i.tipo)!.nome, i.titulo, i.detalhe, i.valor ?? '',
              i.sentido === 'pagar' ? 'a pagar' : i.sentido === 'receber' ? 'a receber' : i.sentido === 'estoque' ? 'produto (custo)' : 'prazo']))}
        >
          Baixar planilha
        </Button>
      </div>
      <div className="flex flex-wrap gap-1">
        {TIPOS.map((t) => (
          <Button key={t.id} size="sm" variant={tipos.has(t.id) ? 'default' : 'outline'} onClick={() => alternar(t.id)}>{t.nome}</Button>
        ))}
      </div>

      {isLoading ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : isError ? (
        <div className="rounded-xl border p-4 text-sm space-y-2">
          <p>Não consegui carregar os vencimentos.</p>
          {error instanceof Error && <p className="text-xs text-muted-foreground">{error.message}</p>}
          <Button variant="outline" onClick={() => refetch()}>Tentar de novo</Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Resumo id="vencidos" titulo="Vencidos" lista={vencidos} cor={vencidos.length ? 'text-red-500' : ''} />
            <Resumo id="hoje" titulo="Vencem hoje" lista={hoje} cor={hoje.length ? 'text-amber-500' : ''} />
            <Resumo id="proximos" titulo={`Próximos ${horizonte} dias`} lista={aVencer} />
          </div>

          {situacao && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Mostrando só: {situacao === 'vencidos' ? 'vencidos' : situacao === 'hoje' ? 'vencem hoje' : `próximos ${horizonte} dias`}</span>
              <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => setSituacao(null)}>Mostrar tudo</Button>
            </div>
          )}
          {lista.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              {situacao ? 'Nada neste grupo.' : `Nada vencido nem vencendo nos próximos ${horizonte} dias.`}
            </p>
          ) : (
            <div className="space-y-1.5">
              {lista.map((i) => {
                const cor = i.tipo === 'encomenda' ? 'border-amber-500 text-amber-500'
                  : i.dias < 0 ? 'border-red-500 text-red-500' : i.dias === 0 ? 'border-amber-500 text-amber-500' : 'text-muted-foreground';
                return (
                  <div key={i.id} className="rounded-lg border bg-card px-3 py-2 flex items-center gap-3">
                    <div className="w-20 flex-shrink-0 text-xs">
                      <p className="font-semibold">{fmt(i.data)}</p>
                      <p className="text-muted-foreground">{TIPOS.find((t) => t.id === i.tipo)!.nome.split(' ')[0]}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{i.titulo}</p>
                      <p className="text-xs text-muted-foreground truncate">{i.detalhe}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      {i.valor != null && i.valor > 0 && (
                        <p className={cn('text-sm font-bold', i.sentido === 'pagar' && 'text-red-500', i.sentido === 'receber' && 'text-green-600')}>
                          {i.sentido === 'pagar' ? '−' : ''}{brl(i.valor)}
                        </p>
                      )}
                      <span className={cn('text-[11px] border rounded px-1', cor)}>{rotuloDias(i)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            Contas a pagar vêm de Boletos; fiados, do saldo em aberto; validade, dos lotes com saldo (valor pelo custo); entrega de OS, da previsão marcada em OS abertas ou em serviço; encomendas, das que chegaram e não foram entregues.
          </p>
        </>
      )}
    </div>
  );
}
