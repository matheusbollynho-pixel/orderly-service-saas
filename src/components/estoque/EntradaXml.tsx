// Estoque > Entrada por XML: lê a NF-e do fornecedor, liga cada item a um produto da loja
// (vínculo já salvo, código de barras ou escolha manual) ou cadastra novo, e dá entrada de uma vez
// pela função importar_nfe (tudo ou nada; a mesma nota não entra duas vezes).
import { useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FileUp, Loader2, Package } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { InventoryProduct } from '@/hooks/useInventory';
import { custoUnitario, fiscalSugerido, lerNfe, type ItemNfe, type NotaNfe } from '@/lib/nfe';
import { matchesSearch } from '@/lib/textSearch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBR = (d: string | null) => (d ? new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '');
const fmtQtd = (v: number) => Number(v.toFixed(3)).toLocaleString('pt-BR');
const r2 = (v: number) => Math.round(v * 100) / 100;
type Prod = InventoryProduct & { controla_validade?: boolean | null };

interface Linha {
  it: ItemNfe;
  acao: 'vincular' | 'novo' | 'ignorar';
  productId: string | null;
  origem: 'vinculo' | 'barras' | null; // como foi ligado sozinho
  fator: string;
  nome: string;
  unidade: string;
  venda: string;
  validade: string; // produto com validade e nota sem lote
  busca: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  products: InventoryProduct[];
  usaAlmox: boolean;
  equipe: string[];
}

export function EntradaXml({ open, onClose, products, usaAlmox, equipe }: Props) {
  const qc = useQueryClient();
  const arquivo = useRef<HTMLInputElement>(null);
  const [nota, setNota] = useState<NotaNfe | null>(null);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [jaLancada, setJaLancada] = useState<string | null>(null);
  const [lendo, setLendo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [margem, setMargem] = useState('80');
  const [somarImpostos, setSomarImpostos] = useState(true);
  const [atualizarCusto, setAtualizarCusto] = useState(true);
  const [atualizarVenda, setAtualizarVenda] = useState(false);
  const [local, setLocal] = useState<'loja' | 'almox'>('loja');
  const [quem, setQuem] = useState('');
  const [aberto, setAberto] = useState<number | null>(null); // busca de produto aberta (índice)

  const porId = useMemo(() => new Map((products as Prod[]).map((p) => [p.id, p])), [products]);
  const fecharTudo = () => { setNota(null); setLinhas([]); setJaLancada(null); setAberto(null); setQuem(''); onClose(); };

  const custoDe = (l: Linha) => custoUnitario(l.it, parseFloat(l.fator.replace(',', '.')) || 1, somarImpostos);
  const vendaSugerida = (custo: number, m = margem) => r2(custo * (1 + (parseFloat(m.replace(',', '.')) || 0) / 100));

  const abrirArquivo = async (f: File) => {
    setLendo(true);
    try {
      const n = lerNfe(await f.text());
      const [{ data: ja }, { data: vinc }] = await Promise.all([
        db.from('nfe_entradas').select('created_at, feito_por').eq('chave', n.chave).maybeSingle(),
        db.from('nfe_vinculos').select('codigo_fornecedor, product_id, fator').eq('fornecedor_cnpj', n.fornecedor.cnpj),
      ]);
      setJaLancada(ja ? `Essa nota já foi lançada em ${new Date(ja.created_at).toLocaleString('pt-BR')}${ja.feito_por ? ` por ${ja.feito_por}` : ''}.` : null);
      const vinculos = new Map<string, { product_id: string; fator: number }>(((vinc ?? []) as { codigo_fornecedor: string; product_id: string; fator: number }[]).map((v) => [v.codigo_fornecedor, v]));
      const porBarras = new Map((products as Prod[]).filter((p) => p.barcode).map((p) => [String(p.barcode).replace(/\D/g, ''), p]));
      setLinhas(n.itens.map((it) => {
        const v = vinculos.get(it.codigo);
        const vProd = v && porId.has(v.product_id) ? porId.get(v.product_id)! : null;
        const bProd = !vProd && it.ean ? porBarras.get(it.ean) ?? null : null;
        const prod = vProd ?? bProd;
        const fator = String(vProd ? Number(v!.fator) : 1);
        const base: Linha = {
          it, acao: prod ? 'vincular' : 'novo', productId: prod?.id ?? null, origem: vProd ? 'vinculo' : bProd ? 'barras' : null,
          fator, nome: it.descricao, unidade: it.unidade === 'UN' ? 'un' : it.unidade.toLowerCase(), venda: '', validade: '', busca: '',
        };
        base.venda = String(vendaSugerida(custoUnitario(it, Number(fator), somarImpostos)));
        return base;
      }));
      setNota(n);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não consegui ler o XML.');
    } finally {
      setLendo(false);
      if (arquivo.current) arquivo.current.value = '';
    }
  };

  const mudar = (i: number, c: Partial<Linha>) => setLinhas((ls) => ls.map((l, k) => (k === i ? { ...l, ...c } : l)));

  const confirmar = async () => {
    if (!nota) return;
    if (equipe.length > 0 && !quem) { toast.error('Selecione quem está dando a entrada.'); return; }
    const validos = linhas.filter((l) => l.acao !== 'ignorar');
    if (validos.length === 0) { toast.error('Nenhum item para dar entrada.'); return; }
    for (const l of validos) {
      const fator = parseFloat(l.fator.replace(',', '.'));
      if (!(fator > 0)) { toast.error(`Quantidade por ${l.it.unidade} inválida em "${l.it.descricao}".`); return; }
      if (l.acao === 'vincular' && !l.productId) { toast.error(`Escolha o produto da loja para "${l.it.descricao}" (ou marque como novo).`); return; }
      if (l.acao === 'novo' && !l.nome.trim()) { toast.error(`Dê um nome ao produto novo "${l.it.descricao}".`); return; }
      const p = l.productId ? porId.get(l.productId) : null;
      if (l.acao === 'vincular' && p?.controla_validade && l.it.lotes.length === 0 && !l.validade) {
        toast.error(`"${p.name}" controla validade: informe a validade (a nota não traz o lote).`); return;
      }
    }
    setSalvando(true);
    const itens = linhas.map((l) => {
      const fator = parseFloat(l.fator.replace(',', '.')) || 1;
      const p = l.productId ? porId.get(l.productId) : null;
      const controla = l.acao === 'novo' ? l.it.lotes.some((x) => x.validade) : !!p?.controla_validade;
      const lotes = controla
        ? (l.it.lotes.length
          ? l.it.lotes.map((x) => ({ numero: x.numero, quantidade: Math.round(x.quantidade * fator * 1000) / 1000, fabricacao: x.fabricacao, validade: x.validade }))
          : l.validade ? [{ numero: null, quantidade: l.it.quantidade * fator, fabricacao: null, validade: l.validade }] : [])
        : [];
      return {
        acao: l.acao,
        product_id: l.acao === 'vincular' ? l.productId : null,
        codigo_fornecedor: l.it.codigo,
        fator,
        quantidade: Math.round(l.it.quantidade * fator * 1000) / 1000,
        custo_unit: custoDe(l),
        descricao_nf: l.it.descricao,
        // Fiscal da nota (produto existente: o banco só preenche o que estiver vazio)
        fiscal: { barcode: l.it.ean, ncm: l.it.ncm, cest: l.it.cest, origem: l.it.origem, ...fiscalSugerido(l.it) },
        venda_nova: l.acao === 'vincular' && atualizarVenda ? vendaSugerida(custoDe(l)) : null,
        novo: l.acao === 'novo' ? {
          name: l.nome.trim(), unit: l.unidade.trim() || 'un', barcode: l.it.ean, ncm: l.it.ncm, cest: l.it.cest,
          sale_price: parseFloat(l.venda.replace(',', '.')) || 0, controla_validade: controla,
        } : null,
        lotes,
      };
    });
    const { data, error } = await db.rpc('importar_nfe', {
      p: {
        chave: nota.chave, numero: nota.numero, serie: nota.serie, emitida_em: nota.emitidaEm,
        fornecedor_nome: nota.fornecedor.fantasia || nota.fornecedor.nome, fornecedor_cnpj: nota.fornecedor.cnpj,
        valor_total: nota.valorTotal, local, quem: quem || null, atualizar_custo: atualizarCusto, itens,
      },
    });
    setSalvando(false);
    if (error) { toast.error(error.message); return; }
    for (const k of ['inventory-products', 'inventory-movements', 'inventory-lotes']) qc.invalidateQueries({ queryKey: [k] });
    toast.success(`Entrada feita: ${data.itens} item(ns)${data.produtos_novos ? `, ${data.produtos_novos} produto(s) novo(s)` : ''}.`);
    fecharTudo();
  };

  const totalEntrada = linhas.filter((l) => l.acao !== 'ignorar').reduce((s, l) => s + custoDe(l) * l.it.quantidade * (parseFloat(l.fator.replace(',', '.')) || 1), 0);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && fecharTudo()}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Entrada por XML (nota do fornecedor)</DialogTitle></DialogHeader>

        {!nota ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Escolha o arquivo <b>.xml</b> da nota fiscal que o fornecedor mandou (por e-mail ou baixado do site dele).
              O sistema lê os itens, liga cada um ao produto da loja e dá entrada no estoque de uma vez.
            </p>
            <input ref={arquivo} type="file" accept=".xml,text/xml,application/xml" className="hidden"
              onChange={(e) => e.target.files?.[0] && abrirArquivo(e.target.files[0])} />
            <Button onClick={() => arquivo.current?.click()} disabled={lendo}>
              {lendo ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileUp className="h-4 w-4 mr-1" />} Escolher o XML
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg border p-2.5 text-sm">
              <p className="font-semibold">{nota.fornecedor.fantasia || nota.fornecedor.nome}</p>
              <p className="text-xs text-muted-foreground">
                NF {nota.numero}{nota.serie ? ` série ${nota.serie}` : ''} · {nota.emitidaEm ? dataBR(nota.emitidaEm) : 'sem data'} · total da nota {brl(nota.valorTotal)} · {nota.itens.length} item(ns)
              </p>
            </div>
            {jaLancada && (
              <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-2.5 text-sm text-red-500">{jaLancada} Não dá para lançar de novo.</div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {equipe.length > 0 && (
                <div className="space-y-1 col-span-2 sm:col-span-1">
                  <Label className="text-xs text-muted-foreground">Quem está fazendo?</Label>
                  <Select value={quem} onValueChange={setQuem}>
                    <SelectTrigger className="h-8"><SelectValue placeholder="Escolha" /></SelectTrigger>
                    <SelectContent>{equipe.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              {usaAlmox && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Entrar em</Label>
                  <Select value={local} onValueChange={(v) => setLocal(v as 'loja' | 'almox')}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="loja">Loja</SelectItem><SelectItem value="almox">Almoxarifado</SelectItem></SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Margem sobre o custo (%)</Label>
                <Input className="h-8" inputMode="decimal" value={margem} onChange={(e) => {
                  setMargem(e.target.value);
                  setLinhas((ls) => ls.map((l) => (l.acao === 'novo' ? { ...l, venda: String(vendaSugerida(custoDe(l), e.target.value)) } : l)));
                }} />
              </div>
            </div>
            <div className="flex flex-wrap gap-4 text-xs">
              <label className="flex items-center gap-1.5"><input type="checkbox" className="h-4 w-4" checked={somarImpostos} onChange={(e) => {
                const s = e.target.checked;
                setSomarImpostos(s);
                setLinhas((ls) => ls.map((l) => (l.acao === 'novo' ? { ...l, venda: String(vendaSugerida(custoUnitario(l.it, parseFloat(l.fator.replace(',', '.')) || 1, s))) } : l)));
              }} />
                Somar frete, IPI e ICMS-ST no custo</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" className="h-4 w-4" checked={atualizarCusto} onChange={(e) => setAtualizarCusto(e.target.checked)} />
                Atualizar o preço de custo dos produtos</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" className="h-4 w-4" checked={atualizarVenda} onChange={(e) => setAtualizarVenda(e.target.checked)} />
                Atualizar também a venda dos produtos que já existem (custo + margem)</label>
            </div>

            <div className="space-y-2">
              {linhas.map((l, i) => {
                const p = l.productId ? porId.get(l.productId) : null;
                const fator = parseFloat(l.fator.replace(',', '.')) || 1;
                const qtdLoja = l.it.quantidade * fator;
                const custo = custoDe(l);
                const sugestoes = aberto === i
                  ? (products as Prod[]).filter((x) => x.active !== false && (!l.busca.trim() || matchesSearch(l.busca.trim(), x.name, x.code))).slice(0, 8)
                  : [];
                return (
                  <div key={l.it.n} className={`rounded-lg border p-2.5 space-y-2 ${l.acao === 'ignorar' ? 'opacity-50' : ''}`}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{l.it.descricao}</p>
                        <p className="text-[11px] text-muted-foreground">
                          Cód. {l.it.codigo}{l.it.ean ? ` · barras ${l.it.ean}` : ''} · {fmtQtd(l.it.quantidade)} {l.it.unidade} × {brl(l.it.valorUnit)} = {brl(l.it.valorTotal)}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        {(['vincular', 'novo', 'ignorar'] as const).map((a) => (
                          <Button key={a} type="button" size="sm" className="h-7 text-xs" variant={l.acao === a ? 'default' : 'outline'}
                            onClick={() => mudar(i, { acao: a, ...(a === 'novo' && !l.venda ? { venda: String(vendaSugerida(custo)) } : {}) })}>
                            {a === 'vincular' ? 'Produto da loja' : a === 'novo' ? 'Cadastrar novo' : 'Ignorar'}
                          </Button>
                        ))}
                      </div>
                    </div>

                    {l.acao !== 'ignorar' && (
                      <>
                        {l.acao === 'vincular' && (
                          <div className="relative">
                            {p && aberto !== i ? (
                              <div className="flex items-center gap-2 text-sm">
                                <Package className="h-4 w-4 text-green-600" />
                                <span className="font-medium">{p.name}</span>
                                <span className="text-xs text-muted-foreground">({p.code} · estoque {p.stock_current} {p.unit}{l.origem === 'vinculo' ? ' · ligado pelas notas anteriores' : l.origem === 'barras' ? ' · achado pelo código de barras' : ''})</span>
                                <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAberto(i)}>Trocar</Button>
                              </div>
                            ) : (
                              <>
                                <Input className="h-8" autoFocus placeholder="Buscar o produto da loja (nome ou código)" value={l.busca}
                                  onFocus={() => setAberto(i)} onChange={(e) => { mudar(i, { busca: e.target.value }); setAberto(i); }} />
                                {aberto === i && (
                                  <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg max-h-52 overflow-y-auto">
                                    {sugestoes.length === 0 ? <p className="px-3 py-2 text-xs text-muted-foreground">Nada encontrado. Use "Cadastrar novo".</p> : sugestoes.map((x) => (
                                      <button key={x.id} type="button" className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted"
                                        onMouseDown={(e) => { e.preventDefault(); mudar(i, { productId: x.id, origem: null, busca: '' }); setAberto(null); }}>
                                        <span className="font-medium">{x.name}</span> <span className="text-muted-foreground">· {x.code} · estoque {x.stock_current} {x.unit}</span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        )}
                        {l.acao === 'novo' && (
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <div className="col-span-2 space-y-1"><Label className="text-[11px] text-muted-foreground">Nome do produto</Label>
                              <Input className="h-8" value={l.nome} onChange={(e) => mudar(i, { nome: e.target.value })} /></div>
                            <div className="space-y-1"><Label className="text-[11px] text-muted-foreground">Unidade</Label>
                              <Input className="h-8" value={l.unidade} onChange={(e) => mudar(i, { unidade: e.target.value })} /></div>
                            <div className="space-y-1"><Label className="text-[11px] text-muted-foreground">Preço de venda (R$)</Label>
                              <Input className="h-8" inputMode="decimal" value={l.venda} onChange={(e) => mudar(i, { venda: e.target.value })} /></div>
                          </div>
                        )}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                          <span className="flex items-center gap-1">1 {l.it.unidade} =
                            <Input className="h-7 w-16 text-xs" inputMode="decimal" value={l.fator} onChange={(e) => {
                              const f = e.target.value;
                              // Produto novo: preço de venda sugerido acompanha o custo
                              mudar(i, l.acao === 'novo' ? { fator: f, venda: String(vendaSugerida(custoUnitario(l.it, parseFloat(f.replace(',', '.')) || 1, somarImpostos))) } : { fator: f });
                            }} />
                            {l.acao === 'novo' ? (l.unidade || 'un') : p?.unit ?? 'un'}
                          </span>
                          <span>Entra: <b>{fmtQtd(qtdLoja)} {l.acao === 'novo' ? (l.unidade || 'un') : p?.unit ?? 'un'}</b></span>
                          <span>Custo: <b>{brl(custo)}</b> cada</span>
                          {l.acao === 'novo' && <span>Venda: <b>{brl(parseFloat(l.venda.replace(',', '.')) || 0)}</b></span>}
                          {l.acao === 'vincular' && p && (
                            atualizarVenda
                              ? <span>Venda: {brl(Number(p.sale_price) || 0)} → <b>{brl(vendaSugerida(custo))}</b></span>
                              : <span>Venda atual: <b>{brl(Number(p.sale_price) || 0)}</b>{custo > 0 && Number(p.sale_price) > 0
                                ? <span className={Number(p.sale_price) < custo ? ' text-red-500' : ' text-muted-foreground'}> (margem {Math.round(((Number(p.sale_price) - custo) / custo) * 100)}% com o custo novo)</span> : null}</span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Fiscal: {[l.it.ncm && `NCM ${l.it.ncm}`, l.it.cest && `CEST ${l.it.cest}`, l.it.origem != null && `origem ${l.it.origem}`,
                            `CSOSN ${fiscalSugerido(l.it).csosn}`, `CFOP ${fiscalSugerido(l.it).cfop}${l.it.comSt ? ' (veio com ST)' : ''}`].filter(Boolean).join(' · ')}
                          {l.acao === 'vincular' ? ' — completa só o que estiver vazio no produto' : ''}
                        </p>
                        {l.it.lotes.length > 0 && (
                          <p className="text-[11px] text-muted-foreground">
                            Lotes: {l.it.lotes.map((x) => `${x.numero || 'sem nº'} (${fmtQtd(x.quantidade * fator)}${x.validade ? `, vence ${dataBR(x.validade)}` : ''})`).join(' · ')}
                          </p>
                        )}
                        {l.acao === 'vincular' && p?.controla_validade && l.it.lotes.length === 0 && (
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-amber-500">Esse produto controla validade e a nota não traz o lote. Validade:</span>
                            <Input type="date" className="h-7 w-40 text-xs" value={l.validade} onChange={(e) => mudar(i, { validade: e.target.value })} />
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
              <p className="text-sm">Entrada no estoque: <b>{brl(totalEntrada)}</b> <span className="text-xs text-muted-foreground">(custo)</span></p>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={fecharTudo}>Cancelar</Button>
                <Button onClick={confirmar} disabled={salvando || !!jaLancada}>
                  {salvando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null} Dar entrada no estoque
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
