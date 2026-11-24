// Relatórios → Estoque: um lugar só, com filtros que valem para todas as seções
// (busca, categoria, marca, fornecedor e local) e planilha em cada seção.
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { buscarTodas } from '@/lib/buscarTodas';
import { useInventory, type InventoryProduct } from '@/hooks/useInventory';
import { useStoreSettings } from '@/hooks/useStoreSettings';
import { useStore } from '@/contexts/StoreContext';
import { matchesSearch } from '@/lib/textSearch';
import { baixarPlanilha } from '@/lib/planilha';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EstoqueParado } from '@/components/EstoqueParado';
import { ValidadeEstoque, type Lote } from '@/components/ValidadeEstoque';
import { RelatorioAlmoxarifado } from '@/components/RelatorioAlmoxarifado';
import { FiadoEmAberto } from '@/components/relatorios/FiadoEmAberto';
import { CurvaABC } from '@/components/relatorios/CurvaABC';
import { SugestaoCompra } from '@/components/relatorios/SugestaoCompra';
import { FolhaContagem } from '@/components/relatorios/FolhaContagem';

type Secao = 'geral' | 'abc' | 'compra' | 'contagem' | 'parados' | 'validade' | 'almox' | 'fiado';
type Local = 'todos' | 'loja' | 'almox';

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const qtd = (v: number) => Number(v.toFixed(3)).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
const unicos = (lista: (string | null | undefined)[]) =>
  [...new Set(lista.map((x) => (x || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));

export default function RelatoriosEstoque() {
  const { products, isLoadingProducts } = useInventory();
  const { settings } = useStoreSettings();
  const { storeId } = useStore();
  const usaAlmox = !!(settings as { usa_almoxarifado?: boolean } | null)?.usa_almoxarifado;
  const [diasAvisoSalvo, setDiasAvisoSalvo] = useState<number | null>(null);
  const diasAviso = diasAvisoSalvo ?? Number((settings as { dias_aviso_validade?: number } | null)?.dias_aviso_validade ?? 30);

  const [secao, setSecao] = useState<Secao>('geral');
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState('todas');
  const [marca, setMarca] = useState('todas');
  const [fornecedor, setFornecedor] = useState('todos');
  const [local, setLocal] = useState<Local>('todos');
  const [incluirInativos, setIncluirInativos] = useState(false);

  const categorias = useMemo(() => unicos(products.map((p) => p.category)), [products]);
  const marcas = useMemo(() => unicos(products.map((p) => p.brand)), [products]);
  const fornecedores = useMemo(() => unicos(products.map((p) => p.supplier)), [products]);
  const algumComValidade = products.some((p) => (p as { controla_validade?: boolean }).controla_validade);

  // Filtros que valem para todas as seções
  const filtrados = useMemo(() => products.filter((p) => {
    if (!incluirInativos && !p.active) return false;
    if (categoria !== 'todas' && (p.category || '').trim() !== categoria) return false;
    if (marca !== 'todas' && (p.brand || '').trim() !== marca) return false;
    if (fornecedor !== 'todos' && (p.supplier || '').trim() !== fornecedor) return false;
    if (busca.trim() && !matchesSearch(busca.trim().toLowerCase(), p.name, p.code, p.barcode, p.brand)) return false;
    return true;
  }), [products, categoria, marca, fornecedor, busca, incluirInativos]);

  const { data: lotes = [] } = useQuery({
    queryKey: ['inventory-lotes'],
    enabled: algumComValidade,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return buscarTodas<Lote>((de, ate) => (supabase as any)
        .from('inventory_lotes')
        .select('id, product_id, local, lote, fabricacao, validade, quantidade')
        .gt('quantidade', 0)
        .order('id', { ascending: true })
        .range(de, ate));
    },
  });

  const saldo = (p: InventoryProduct) => {
    const loja = Number(p.stock_current || 0);
    const almox = Number((p as { stock_almox?: number }).stock_almox ?? 0);
    return local === 'loja' ? loja : local === 'almox' ? almox : loja + almox;
  };

  // Visão geral: totais e quebra por categoria e por marca
  const geral = useMemo(() => {
    const linhas = filtrados.map((p) => {
      const s = saldo(p);
      return { p, s, custo: s * Number(p.cost_price || 0), venda: s * Number(p.sale_price || 0) };
    });
    const agrupar = (chave: (p: InventoryProduct) => string | null | undefined) => {
      const m = new Map<string, { itens: number; qtd: number; custo: number; venda: number }>();
      for (const l of linhas) {
        const k = (chave(l.p) || '').trim() || '(sem)';
        if (!m.has(k)) m.set(k, { itens: 0, qtd: 0, custo: 0, venda: 0 });
        const g = m.get(k)!;
        g.itens += 1; g.qtd += l.s; g.custo += l.custo; g.venda += l.venda;
      }
      return [...m.entries()].map(([nome, g]) => ({ nome, ...g })).sort((a, b) => b.custo - a.custo);
    };
    const tot = linhas.reduce((a, l) => ({ custo: a.custo + l.custo, venda: a.venda + l.venda }), { custo: 0, venda: 0 });
    return {
      linhas,
      tot,
      comSaldo: linhas.filter((l) => l.s > 0.0005).length,
      zerados: linhas.filter((l) => l.s <= 0.0005).length,
      abaixoMinimo: linhas.filter((l) => Number(l.p.stock_minimum) > 0 && Number(l.p.stock_current) <= Number(l.p.stock_minimum)).length,
      porCategoria: agrupar((p) => p.category),
      porMarca: agrupar((p) => p.brand),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtrados, local]);

  const SECOES: { id: Secao; nome: string; mostrar: boolean }[] = [
    { id: 'geral', nome: 'Visão geral', mostrar: true },
    { id: 'abc', nome: 'Mais vendidos (ABC)', mostrar: true },
    { id: 'compra', nome: 'Sugestão de compra', mostrar: true },
    { id: 'parados', nome: 'Parados', mostrar: true },
    { id: 'fiado', nome: 'Fiado em aberto', mostrar: true },
    { id: 'validade', nome: 'Validade', mostrar: algumComValidade },
    { id: 'almox', nome: 'Consumo do almoxarifado', mostrar: usaAlmox },
    { id: 'contagem', nome: 'Folha de contagem', mostrar: true },
  ];

  const tabelaGrupo = (titulo: string, dados: typeof geral.porCategoria) => (
    <section className="rounded-xl border bg-card p-3 space-y-2">
      <h3 className="text-sm font-semibold">{titulo}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-muted-foreground">
            <tr className="text-left">
              <th className="py-1 pr-2">{titulo.replace('Por ', '')}</th>
              <th className="py-1 px-1 text-right">Produtos</th>
              <th className="py-1 px-1 text-right">Valor de custo</th>
              <th className="py-1 px-1 text-right">Valor de venda</th>
              <th className="py-1 pl-1 text-right">Lucro potencial</th>
            </tr>
          </thead>
          <tbody>
            {dados.map((g) => (
              <tr key={g.nome} className="border-t border-border/50">
                <td className="py-1 pr-2">{g.nome}</td>
                <td className="py-1 px-1 text-right">{g.itens}</td>
                <td className="py-1 px-1 text-right">{brl(g.custo)}</td>
                <td className="py-1 px-1 text-right">{brl(g.venda)}</td>
                <td className="py-1 pl-1 text-right">{brl(g.venda - g.custo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="rounded-xl border bg-card p-3 space-y-2">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Input className="h-10 sm:col-span-3" placeholder="Buscar produto, código, código de barras ou marca..." value={busca} onChange={(e) => setBusca(e.target.value)} />
          <Select value={categoria} onValueChange={setCategoria}>
            <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as categorias</SelectItem>
              {categorias.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={marca} onValueChange={setMarca}>
            <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as marcas</SelectItem>
              {marcas.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fornecedor} onValueChange={setFornecedor}>
            <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os fornecedores</SelectItem>
              {fornecedores.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {usaAlmox && (
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">Local:</span>
              {(['todos', 'loja', 'almox'] as Local[]).map((l) => (
                <Button key={l} size="sm" variant={local === l ? 'default' : 'outline'} onClick={() => setLocal(l)}>
                  {l === 'todos' ? 'Loja + almoxarifado' : l === 'loja' ? 'Loja' : 'Almoxarifado'}
                </Button>
              ))}
            </div>
          )}
          <label className="flex items-center gap-2 text-muted-foreground">
            <input type="checkbox" className="h-4 w-4" checked={incluirInativos} onChange={(e) => setIncluirInativos(e.target.checked)} />
            Incluir produtos inativos
          </label>
          <span className="ml-auto text-xs text-muted-foreground">{filtrados.length} produto(s) no filtro</span>
        </div>
      </div>

      {/* Seções */}
      <div className="flex flex-wrap gap-1">
        {SECOES.filter((s) => s.mostrar).map((s) => (
          <Button key={s.id} size="sm" variant={secao === s.id ? 'default' : 'outline'} onClick={() => setSecao(s.id)}>
            {s.nome}
          </Button>
        ))}
      </div>

      {isLoadingProducts ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : secao === 'geral' ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="rounded-xl border bg-card p-3">
              <p className="text-xs text-muted-foreground">Valor de custo</p>
              <p className="text-lg font-bold">{brl(geral.tot.custo)}</p>
            </div>
            <div className="rounded-xl border bg-card p-3">
              <p className="text-xs text-muted-foreground">Valor de venda</p>
              <p className="text-lg font-bold">{brl(geral.tot.venda)}</p>
            </div>
            <div className="rounded-xl border bg-card p-3">
              <p className="text-xs text-muted-foreground">Lucro potencial</p>
              <p className="text-lg font-bold text-green-600 dark:text-green-400">{brl(geral.tot.venda - geral.tot.custo)}</p>
            </div>
            <div className="rounded-xl border bg-card p-3">
              <p className="text-xs text-muted-foreground">Com saldo / zerados</p>
              <p className="text-lg font-bold">{geral.comSaldo} / {geral.zerados}</p>
            </div>
            <div className="rounded-xl border bg-card p-3">
              <p className="text-xs text-muted-foreground">Abaixo do mínimo</p>
              <p className={`text-lg font-bold ${geral.abaixoMinimo > 0 ? 'text-red-500' : ''}`}>{geral.abaixoMinimo}</p>
            </div>
            <div className="rounded-xl border bg-card p-3 flex items-center">
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                disabled={geral.linhas.length === 0}
                onClick={() => baixarPlanilha('estoque-visao-geral',
                  ['Código', 'Produto', 'Categoria', 'Marca', 'Fornecedor', 'Unidade', 'Saldo loja', 'Saldo almoxarifado', 'Saldo considerado', 'Mínimo', 'Custo unitário', 'Venda unitária', 'Valor de custo', 'Valor de venda', 'Lucro potencial', 'Ativo'],
                  geral.linhas.map(({ p, s, custo, venda }) => [
                    p.code, p.name, p.category, p.brand, p.supplier, p.unit,
                    Number(p.stock_current || 0), Number((p as { stock_almox?: number }).stock_almox ?? 0), s,
                    Number(p.stock_minimum || 0), Number(p.cost_price || 0), Number(p.sale_price || 0),
                    custo, venda, venda - custo, p.active ? 'sim' : 'não',
                  ]))}
              >
                Baixar planilha
              </Button>
            </div>
          </div>
          {tabelaGrupo('Por categoria', geral.porCategoria)}
          {tabelaGrupo('Por marca', geral.porMarca)}
          <p className="text-[11px] text-muted-foreground">
            Valores = saldo × preço de custo/venda atual. {qtd(geral.linhas.reduce((s, l) => s + l.s, 0))} unidades somadas no filtro.
          </p>
        </div>
      ) : secao === 'fiado' ? (
        <FiadoEmAberto
          produtos={products}
          idsNoFiltro={new Set(filtrados.map((p) => p.id))}
          filtroDeProdutoAtivo={categoria !== 'todas' || marca !== 'todas' || fornecedor !== 'todos'}
          busca={busca}
        />
      ) : secao === 'abc' ? (
        <CurvaABC products={filtrados} />
      ) : secao === 'compra' ? (
        <SugestaoCompra products={filtrados} />
      ) : secao === 'contagem' ? (
        <FolhaContagem products={filtrados} local={local} nomeLoja={(settings as { company_name?: string } | null)?.company_name} />
      ) : secao === 'parados' ? (
        <EstoqueParado products={filtrados} local={local} />
      ) : secao === 'validade' ? (
        <ValidadeEstoque
          products={filtrados}
          lotes={lotes}
          diasAviso={diasAviso}
          storeId={storeId}
          usaAlmox={usaAlmox}
          onDiasSalvo={setDiasAvisoSalvo}
          local={local}
        />
      ) : (
        <RelatorioAlmoxarifado products={filtrados} />
      )}
    </div>
  );
}
