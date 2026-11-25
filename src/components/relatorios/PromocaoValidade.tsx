// Promoção de produtos perto de vencer: monta a lista com desconto e imprime plaquinhas
// para a frente da loja. NÃO muda o preço cadastrado — o desconto é dado na venda.
// Só entram lotes da loja (almoxarifado é consumo interno) que ainda não venceram.
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import type { InventoryProduct } from '@/hooks/useInventory';
import type { Lote } from '@/components/ValidadeEstoque';
import { diasParaVencer, fmtData } from '@/components/ValidadeEstoque';
import { baixarPlanilha } from '@/lib/planilha';

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const qtd = (v: number) => Number(Number(v).toFixed(3)).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** Sugestão inicial: quanto mais perto de vencer, maior o desconto. */
export const descontoSugerido = (dias: number) => (dias <= 7 ? 30 : dias <= 15 ? 20 : 10);

interface Props {
  products: InventoryProduct[];
  lotes: Lote[];
  diasAviso: number;
  nomeLoja?: string | null;
}

interface Item {
  p: InventoryProduct;
  dias: number;
  validade: string;
  quantidade: number;
  de: number;
  custo: number;
}

export function PromocaoValidade({ products, lotes, diasAviso, nomeLoja }: Props) {
  const porId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  // Um item por produto: soma os lotes da loja que vencem de hoje até o prazo de aviso
  const itens = useMemo<Item[]>(() => {
    const m = new Map<string, Item>();
    for (const l of lotes) {
      const p = porId.get(l.product_id);
      const dias = diasParaVencer(l.validade);
      if (!p || !p.active || l.local !== 'loja' || dias == null || dias < 0 || dias > diasAviso) continue;
      if (Number(l.quantidade) <= 0.0005 || Number(p.sale_price || 0) <= 0) continue;
      const atual = m.get(p.id);
      if (!atual) {
        m.set(p.id, { p, dias, validade: l.validade!, quantidade: Number(l.quantidade), de: Number(p.sale_price), custo: Number(p.cost_price || 0) });
      } else {
        atual.quantidade += Number(l.quantidade);
        if (dias < atual.dias) { atual.dias = dias; atual.validade = l.validade!; }
      }
    }
    return [...m.values()].sort((a, b) => a.dias - b.dias || a.p.name.localeCompare(b.p.name, 'pt-BR'));
  }, [lotes, porId, diasAviso]);

  const [desconto, setDesconto] = useState<Record<string, string>>({});
  const [fora, setFora] = useState<Set<string>>(new Set());
  const [todos, setTodos] = useState('');
  const [mostrarValidade, setMostrarValidade] = useState(true);

  // Itens novos recebem a sugestão; o que a pessoa já digitou fica
  useEffect(() => {
    setDesconto((d) => {
      const novo = { ...d };
      for (const it of itens) if (novo[it.p.id] == null) novo[it.p.id] = String(descontoSugerido(it.dias));
      return novo;
    });
  }, [itens]);

  const pct = (id: string) => Math.min(90, Math.max(0, Number((desconto[id] || '0').replace(',', '.')) || 0));
  const por = (it: Item) => Math.round(it.de * (1 - pct(it.p.id) / 100) * 100) / 100;
  const escolhidos = itens.filter((it) => !fora.has(it.p.id) && pct(it.p.id) > 0);
  const abaixoCusto = escolhidos.filter((it) => it.custo > 0 && por(it) < it.custo).length;

  const aplicarTodos = () => {
    const n = todos.replace(/\D/g, '');
    if (!n) return;
    setDesconto(Object.fromEntries(itens.map((it) => [it.p.id, n])));
  };

  const alternar = (id: string) => setFora((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const imprimir = () => {
    const cards = escolhidos.map((it) => `
      <div class="card">
        ${nomeLoja ? `<div class="loja">${esc(nomeLoja)}</div>` : ''}
        <div class="selo">-${pct(it.p.id)}%</div>
        <div class="nome">${esc(it.p.name)}</div>
        ${it.p.brand ? `<div class="marca">${esc(it.p.brand)}</div>` : ''}
        <div class="de">De ${esc(brl(it.de))}</div>
        <div class="por"><small>por</small> ${esc(brl(por(it)))}</div>
        <div class="rodape">${mostrarValidade ? `Validade ${esc(fmtData(it.validade))} · ` : ''}Enquanto durar o estoque</div>
      </div>`).join('');
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Plaquinhas de promoção</title>
      <style>
        @page{size:A4;margin:8mm}
        body{font-family:Arial,sans-serif;margin:0;color:#000}
        .grade{display:grid;grid-template-columns:1fr 1fr;gap:6mm}
        .card{border:2px dashed #000;border-radius:4mm;padding:5mm;height:62mm;box-sizing:border-box;position:relative;
          display:flex;flex-direction:column;page-break-inside:avoid;break-inside:avoid;overflow:hidden}
        .loja{font-size:10pt;text-transform:uppercase;letter-spacing:1px;color:#444}
        .selo{position:absolute;top:4mm;right:4mm;background:#000;color:#fff;font-weight:bold;font-size:16pt;padding:1mm 3mm;border-radius:2mm}
        .nome{font-size:15pt;font-weight:bold;margin-top:3mm;padding-right:22mm;line-height:1.15;max-height:3.5em;overflow:hidden}
        .marca{font-size:10pt;color:#444}
        .de{margin-top:auto;font-size:13pt;text-decoration:line-through;color:#444}
        .por{font-size:30pt;font-weight:bold;line-height:1.1}
        .por small{font-size:12pt;font-weight:normal}
        .rodape{font-size:9pt;color:#444;margin-top:1mm}
      </style></head><body>
      <div class="grade">${cards}</div>
      <script>window.onload=function(){window.print()}</script>
      </body></html>`;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html);
    w.document.close();
  };

  if (itens.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        Nenhum produto da loja vencendo nos próximos {diasAviso} dias. Produtos já vencidos não entram na promoção.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border bg-card p-3 space-y-2 text-sm">
        <p className="text-xs text-muted-foreground">
          Produtos da loja que vencem em até {diasAviso} dias. O desconto sugerido é de 30% até 7 dias, 20% até 15 dias e 10% depois disso.
          O preço cadastrado não muda: dê o desconto na hora da venda.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="text-[11px] text-muted-foreground block">Mesmo desconto pra todos (%)</label>
            <div className="flex gap-1">
              <Input className="h-8 w-20" inputMode="numeric" aria-label="Mesmo desconto pra todos" value={todos} onChange={(e) => setTodos(e.target.value.replace(/\D/g, '').slice(0, 2))} />
              <Button size="sm" variant="outline" onClick={aplicarTodos} disabled={!todos}>Aplicar</Button>
            </div>
          </div>
          <label className="flex items-center gap-1.5 text-xs">
            <Checkbox checked={mostrarValidade} onCheckedChange={(v) => setMostrarValidade(v === true)} />
            Mostrar a validade na plaquinha
          </label>
          <div className="flex gap-1 ml-auto">
            <Button
              size="sm"
              variant="outline"
              disabled={escolhidos.length === 0}
              onClick={() => baixarPlanilha('promocao-validade',
                ['Produto', 'Código', 'Validade', 'Dias para vencer', 'Quantidade', 'Unidade', 'Preço normal', 'Desconto %', 'Preço promoção', 'Custo'],
                escolhidos.map((it) => [it.p.name, it.p.code, fmtData(it.validade), it.dias, it.quantidade, it.p.unit, it.de, pct(it.p.id), por(it), it.custo]))}
            >
              Baixar planilha
            </Button>
            <Button size="sm" disabled={escolhidos.length === 0} onClick={imprimir}>
              Imprimir plaquinhas ({escolhidos.length})
            </Button>
          </div>
        </div>
        {abaixoCusto > 0 && (
          <p className="text-xs text-red-500">{abaixoCusto} produto(s) ficariam abaixo do custo com esse desconto.</p>
        )}
      </div>

      <div className="space-y-1.5">
        {itens.map((it) => {
          const dentro = !fora.has(it.p.id);
          const preco = por(it);
          const prejuizo = it.custo > 0 && preco < it.custo;
          return (
            <div key={it.p.id} className={`rounded-lg border bg-card px-3 py-2 flex items-center gap-2 sm:gap-3 ${dentro ? '' : 'opacity-50'}`}>
              <Checkbox checked={dentro} onCheckedChange={() => alternar(it.p.id)} aria-label={`Incluir ${it.p.name}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium line-clamp-2 break-words">{it.p.name}</p>
                <p className="text-xs text-muted-foreground">
                  {qtd(it.quantidade)} {(it.p.unit || '').toUpperCase()} · validade {fmtData(it.validade)} ·{' '}
                  <span className={it.dias <= 7 ? 'text-red-500' : 'text-amber-500'}>
                    {it.dias === 0 ? 'vence hoje' : `vence em ${it.dias} dia${it.dias === 1 ? '' : 's'}`}
                  </span>
                </p>
                {prejuizo && <p className="text-[11px] text-red-500">Abaixo do custo ({brl(it.custo)})</p>}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Input
                  className="h-8 w-14 text-right"
                  inputMode="numeric"
                  value={desconto[it.p.id] ?? ''}
                  onChange={(e) => setDesconto((d) => ({ ...d, [it.p.id]: e.target.value.replace(/\D/g, '').slice(0, 2) }))}
                  aria-label={`Desconto de ${it.p.name}`}
                />
                <span className="text-xs text-muted-foreground">%</span>
              </div>
              <div className="text-right flex-shrink-0 w-20 sm:w-24">
                <p className="text-[11px] text-muted-foreground line-through">{brl(it.de)}</p>
                <p className={`text-sm font-bold ${prejuizo ? 'text-red-500' : ''}`}>{brl(preco)}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
