// Aba "Validade" do Estoque: lotes vencidos e a vencer (produtos que controlam
// lote e validade). O prazo de aviso é da loja (store_settings.dias_aviso_validade).
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { InventoryProduct } from '@/hooks/useInventory';
import { baixarPlanilha } from '@/lib/planilha';
import { PromocaoValidade } from '@/components/relatorios/PromocaoValidade';

export interface Lote {
  id: string;
  product_id: string;
  local: 'loja' | 'almox';
  lote: string | null;
  fabricacao: string | null;
  validade: string | null;
  quantidade: number;
}

const DIA = 86400000;
export function diasParaVencer(validade: string | null): number | null {
  if (!validade) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const v = new Date(`${validade}T00:00:00`);
  return Math.round((v.getTime() - hoje.getTime()) / DIA);
}
export const fmtData = (d: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('pt-BR') : '—');
const qtd = (v: number) => Number(Number(v).toFixed(3)).toLocaleString('pt-BR', { maximumFractionDigits: 3 });

interface Props {
  products: InventoryProduct[];
  lotes: Lote[];
  diasAviso: number;
  storeId: string | null;
  usaAlmox: boolean;
  onDiasSalvo: (dias: number) => void;
  local?: 'todos' | 'loja' | 'almox';
  nomeLoja?: string | null;
}

export function ValidadeEstoque({ products, lotes: todosLotes, diasAviso, storeId, usaAlmox, onDiasSalvo, local = 'todos', nomeLoja }: Props) {
  const lotes = useMemo(() => (local === 'todos' ? todosLotes : todosLotes.filter((l) => l.local === local)), [todosLotes, local]);
  const [filtro, setFiltro] = useState<'aviso' | 'todos' | 'promocao'>('aviso');
  const [dias, setDias] = useState(String(diasAviso));
  const [salvando, setSalvando] = useState(false);
  const porId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const linhas = useMemo(() => {
    return lotes
      .filter((l) => Number(l.quantidade) > 0.0005 && porId.has(l.product_id))
      .map((l) => ({ ...l, dias: diasParaVencer(l.validade) }))
      .filter((l) => filtro === 'todos' || (l.dias != null && l.dias <= diasAviso))
      .sort((a, b) => (a.dias ?? 99999) - (b.dias ?? 99999));
  }, [lotes, porId, filtro, diasAviso]);

  const vencidos = lotes.filter((l) => Number(l.quantidade) > 0.0005 && (diasParaVencer(l.validade) ?? 1) < 0).length;
  const aVencer = lotes.filter((l) => {
    const d = diasParaVencer(l.validade);
    return Number(l.quantidade) > 0.0005 && d != null && d >= 0 && d <= diasAviso;
  }).length;

  // Estoque do produto sem lote informado (ex.: saldo de antes de ligar a validade)
  const semLote = useMemo(() => {
    return products
      .filter((p) => (p as { controla_validade?: boolean }).controla_validade)
      .map((p) => {
        const somaLoja = todosLotes.filter((l) => l.product_id === p.id && l.local === 'loja').reduce((s, l) => s + Number(l.quantidade), 0);
        const somaAlmox = todosLotes.filter((l) => l.product_id === p.id && l.local === 'almox').reduce((s, l) => s + Number(l.quantidade), 0);
        const loja = local === 'almox' ? 0 : Number(p.stock_current) - somaLoja;
        const almox = local === 'loja' ? 0 : Number((p as { stock_almox?: number }).stock_almox ?? 0) - somaAlmox;
        return { p, loja, almox };
      })
      .filter((r) => r.loja > 0.0005 || r.almox > 0.0005);
  }, [products, todosLotes, local]);

  async function salvarDias() {
    const n = parseInt(dias, 10);
    if (!storeId || !n || n < 1 || n > 365) { toast.error('Informe de 1 a 365 dias.'); return; }
    setSalvando(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from('store_settings').update({ dias_aviso_validade: n }).eq('id', storeId);
    setSalvando(false);
    if (error) { toast.error('Não consegui salvar: ' + error.message); return; }
    toast.success(`Aviso de validade: ${n} dias antes.`);
    onDiasSalvo(n);
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border bg-card p-3">
          <p className="text-xs text-muted-foreground">Lotes vencidos</p>
          <p className={`text-lg font-bold ${vencidos > 0 ? 'text-red-500' : ''}`}>{vencidos}</p>
        </div>
        <div className="rounded-xl border bg-card p-3">
          <p className="text-xs text-muted-foreground">Vencem em até {diasAviso} dias</p>
          <p className={`text-lg font-bold ${aVencer > 0 ? 'text-amber-500' : ''}`}>{aVencer}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex gap-1">
          <Button size="sm" variant={filtro === 'aviso' ? 'default' : 'outline'} onClick={() => setFiltro('aviso')}>Vencidos e a vencer</Button>
          <Button size="sm" variant={filtro === 'todos' ? 'default' : 'outline'} onClick={() => setFiltro('todos')}>Todos os lotes</Button>
          <Button size="sm" variant={filtro === 'promocao' ? 'default' : 'outline'} onClick={() => setFiltro('promocao')}>Montar promoção</Button>
        </div>
        {filtro !== 'promocao' && <Button
          size="sm"
          variant="outline"
          disabled={linhas.length === 0}
          onClick={() => baixarPlanilha('validade-lotes',
            ['Produto', 'Código', 'Lote', 'Fabricação', 'Validade', 'Dias para vencer', 'Local', 'Quantidade', 'Unidade', 'Custo unitário', 'Valor (custo)'],
            linhas.map((l) => {
              const p = porId.get(l.product_id)!;
              return [p.name, p.code, l.lote || 'sem número', fmtData(l.fabricacao), fmtData(l.validade), l.dias ?? '',
                l.local === 'almox' ? 'almoxarifado' : 'loja', Number(l.quantidade), p.unit, Number(p.cost_price || 0),
                Number(l.quantidade) * Number(p.cost_price || 0)];
            }))}
        >
          Baixar planilha
        </Button>}
        <div className="flex items-end gap-1 ml-auto">
          <div>
            <label className="text-[11px] text-muted-foreground block">Avisar com (dias)</label>
            <Input className="h-8 w-20" inputMode="numeric" value={dias} onChange={(e) => setDias(e.target.value.replace(/\D/g, '').slice(0, 3))} />
          </div>
          <Button size="sm" variant="outline" onClick={salvarDias} disabled={salvando || dias === String(diasAviso)}>Salvar</Button>
        </div>
      </div>

      {filtro === 'promocao' ? (
        <PromocaoValidade products={products} lotes={todosLotes} diasAviso={diasAviso} nomeLoja={nomeLoja} />
      ) : linhas.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          {filtro === 'aviso' ? `Nenhum lote vencido ou vencendo em até ${diasAviso} dias.` : 'Nenhum lote com saldo.'}
        </p>
      ) : (
        <div className="space-y-1.5">
          {linhas.map((l) => {
            const p = porId.get(l.product_id)!;
            const cor = l.dias == null ? '' : l.dias < 0 ? 'border-red-500 text-red-500' : l.dias <= diasAviso ? 'border-amber-500 text-amber-500' : '';
            return (
              <div key={l.id} className="rounded-lg border bg-card px-3 py-2 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Lote {l.lote || 'sem número'} · fab. {fmtData(l.fabricacao)} · validade {fmtData(l.validade)}
                    {usaAlmox ? ` · ${l.local === 'almox' ? 'almoxarifado' : 'loja'}` : ''}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold">{qtd(l.quantidade)} {(p.unit || '').toUpperCase()}</p>
                  {l.dias != null && (
                    <span className={`text-[11px] border rounded px-1 ${cor}`}>
                      {l.dias < 0 ? `vencido há ${-l.dias} dia${l.dias === -1 ? '' : 's'}` : l.dias === 0 ? 'vence hoje' : `vence em ${l.dias} dia${l.dias === 1 ? '' : 's'}`}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {filtro !== 'promocao' && semLote.length > 0 && (
        <div className="rounded-xl border bg-card p-3 space-y-1">
          <p className="text-xs font-semibold">Estoque sem lote informado</p>
          <p className="text-[11px] text-muted-foreground">Saldo que já existia antes de ligar a validade ou que entrou sem lote. Use "Ajuste" ou dê entrada com o lote para organizar.</p>
          {semLote.map((r) => (
            <p key={r.p.id} className="text-xs">
              {r.p.name}: {r.loja > 0.0005 ? `${qtd(r.loja)} na loja` : ''}{r.loja > 0.0005 && r.almox > 0.0005 ? ' · ' : ''}{r.almox > 0.0005 ? `${qtd(r.almox)} no almoxarifado` : ''}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
