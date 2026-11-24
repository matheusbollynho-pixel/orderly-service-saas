// Relatórios → Estoque → "Folha de contagem": lista pra imprimir e contar o estoque.
// Usa os filtros do Estoque (categoria, marca, fornecedor, local). Por padrão a contagem é
// "cega" (sem o saldo do sistema), pra quem conta não copiar o número da tela.
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { baixarPlanilha } from '@/lib/planilha';
import type { InventoryProduct } from '@/hooks/useInventory';

type Local = 'todos' | 'loja' | 'almox';
type Agrupar = 'categoria' | 'marca' | 'fornecedor' | 'nenhum';

const qtd = (v: number) => Number(v.toFixed(3)).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
const esc = (t: unknown) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export function FolhaContagem({ products, local, nomeLoja }: { products: InventoryProduct[]; local: Local; nomeLoja?: string }) {
  const [mostrarSaldo, setMostrarSaldo] = useState(false);
  const [soComSaldo, setSoComSaldo] = useState(false);
  const [agrupar, setAgrupar] = useState<Agrupar>('categoria');

  const saldo = (p: InventoryProduct) => {
    const loja = Number(p.stock_current || 0);
    const almox = Number((p as { stock_almox?: number }).stock_almox ?? 0);
    return local === 'loja' ? loja : local === 'almox' ? almox : loja + almox;
  };

  const grupos = useMemo(() => {
    const lista = products
      .filter((p) => p.active && (!soComSaldo || saldo(p) > 0.0005))
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR'));
    if (agrupar === 'nenhum') return [{ nome: '', itens: lista }];
    const m = new Map<string, InventoryProduct[]>();
    for (const p of lista) {
      const k = ((agrupar === 'categoria' ? p.category : agrupar === 'marca' ? p.brand : p.supplier) || '').trim() || `Sem ${agrupar}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(p);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR')).map(([nome, itens]) => ({ nome, itens }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, soComSaldo, agrupar, local]);

  const total = grupos.reduce((s, g) => s + g.itens.length, 0);
  const rotuloLocal = local === 'loja' ? 'Loja' : local === 'almox' ? 'Almoxarifado' : 'Loja + almoxarifado';

  const imprimir = () => {
    const hoje = new Date().toLocaleDateString('pt-BR');
    const cab = `<tr><th>Código</th><th>Produto</th><th>Un.</th>${mostrarSaldo ? '<th class="n">Sistema</th>' : ''}<th class="n">Contado</th><th>Obs.</th></tr>`;
    const corpo = grupos.map((g) => `
      ${g.nome ? `<h2>${esc(g.nome)} <small>(${g.itens.length})</small></h2>` : ''}
      <table><thead>${cab}</thead><tbody>
      ${g.itens.map((p) => `<tr><td>${esc(p.code)}</td><td>${esc(p.name)}${p.brand ? ` <small>${esc(p.brand)}</small>` : ''}</td><td>${esc((p.unit || '').toUpperCase())}</td>${mostrarSaldo ? `<td class="n">${qtd(saldo(p))}</td>` : ''}<td class="caixa"></td><td class="obs"></td></tr>`).join('')}
      </tbody></table>`).join('');
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Folha de contagem ${hoje}</title>
      <style>
        body{font-family:Arial,sans-serif;font-size:11px;margin:16px;color:#000}
        h1{font-size:16px;margin:0 0 2px} h2{font-size:13px;margin:14px 0 4px;border-bottom:1px solid #000}
        .info{margin-bottom:8px} table{width:100%;border-collapse:collapse;page-break-inside:auto}
        tr{page-break-inside:avoid} th,td{border:1px solid #888;padding:4px 5px;text-align:left;vertical-align:top}
        th{background:#eee} .n{text-align:right;width:60px} .caixa{width:70px} .obs{width:120px} small{color:#555}
        .assin{margin-top:24px;display:flex;gap:40px} .assin div{flex:1;border-top:1px solid #000;padding-top:3px}
        @media print{body{margin:8mm}}
      </style></head><body>
      <h1>Folha de contagem${nomeLoja ? ` — ${esc(nomeLoja)}` : ''}</h1>
      <div class="info">Data: ${hoje} · Local: ${rotuloLocal} · ${total} produto(s)${mostrarSaldo ? '' : ' · contagem cega (sem saldo do sistema)'}</div>
      ${corpo}
      <div class="assin"><div>Contado por</div><div>Conferido por</div></div>
      <script>window.onload=function(){window.print()}</script>
      </body></html>`;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html);
    w.document.close();
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border bg-card p-3 space-y-2 text-sm">
        <div className="flex flex-wrap items-center gap-1">
          <span className="mr-1 text-muted-foreground">Separar por:</span>
          {(['categoria', 'marca', 'fornecedor', 'nenhum'] as Agrupar[]).map((a) => (
            <Button key={a} size="sm" variant={agrupar === a ? 'default' : 'outline'} onClick={() => setAgrupar(a)}>
              {a === 'nenhum' ? 'Não separar' : a[0].toUpperCase() + a.slice(1)}
            </Button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-muted-foreground">
          <input type="checkbox" className="h-4 w-4" checked={mostrarSaldo} onChange={(e) => setMostrarSaldo(e.target.checked)} />
          Mostrar o saldo do sistema na folha (desligado = contagem cega, mais confiável)
        </label>
        <label className="flex items-center gap-2 text-muted-foreground">
          <input type="checkbox" className="h-4 w-4" checked={soComSaldo} onChange={(e) => setSoComSaldo(e.target.checked)} />
          Só produtos com saldo no sistema
        </label>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button onClick={imprimir} disabled={total === 0}>Imprimir folha ({total})</Button>
          <Button
            variant="outline"
            disabled={total === 0}
            onClick={() => baixarPlanilha('folha-de-contagem',
              ['Grupo', 'Código', 'Produto', 'Marca', 'Unidade', ...(mostrarSaldo ? ['Sistema'] : []), 'Contado', 'Diferença'],
              grupos.flatMap((g) => g.itens.map((p) => [g.nome, p.code, p.name, p.brand, p.unit, ...(mostrarSaldo ? [saldo(p)] : []), '', ''])))}
          >
            Baixar planilha
          </Button>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Usa os filtros acima (categoria, marca, fornecedor{local !== 'todos' ? ', local' : ''}). Local da folha: {rotuloLocal}.
        Depois de contar, acerte as diferenças em Estoque → Registrar movimentação → Ajuste.
      </p>
    </div>
  );
}
