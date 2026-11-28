// Estoque › Almoxarifado (loja com almoxarifado ligado): o que tem lá, aviso de mínimo,
// baixa sem OS (uso geral da oficina, com motivo e quem retirou) e abastecer vários itens da loja de uma vez.
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowRightLeft, Loader2, PackageMinus, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useStore } from '@/contexts/StoreContext';
import type { InventoryProduct } from '@/hooks/useInventory';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { fracaoDaEmbalagem, qtdEstoque, textoParte, unidadesDoConteudo } from '@/lib/almoxarifado';
import { matchesSearch } from '@/lib/textSearch';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
type P = InventoryProduct & {
  stock_almox?: number | null; stock_minimo_almox?: number | null; uso?: string | null;
  conteudo_qtd?: number | null; conteudo_unidade?: string | null; e_kit?: boolean | null;
};
const num = (v: unknown) => Number(v) || 0;
const fmt = (v: number) => String(qtdEstoque(v)).replace('.', ',');

export const MOTIVOS_CONSUMO = ['Uso geral da oficina', 'Limpeza', 'Perda ou quebra', 'Venceu', 'Outro'];

/** O que aparece na aba: tem saldo no almoxarifado, é de uso interno ou tem mínimo do almoxarifado (kit fica fora). */
export function produtosDoAlmox(lista: P[]): P[] {
  return lista
    .filter((p) => p.active !== false && !p.e_kit && (num(p.stock_almox) > 0 || p.uso === 'interno' || num(p.stock_minimo_almox) > 0))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}
export const abaixoDoMinimoAlmox = (p: P) => num(p.stock_minimo_almox) > 0 && num(p.stock_almox) <= num(p.stock_minimo_almox);

interface Props { products: InventoryProduct[]; equipe: string[] }

export function AbaAlmoxarifado({ products, equipe }: Props) {
  const lista = useMemo(() => produtosDoAlmox(products as P[]), [products]);
  const [busca, setBusca] = useState('');
  const [soBaixo, setSoBaixo] = useState(false);
  const [retirar, setRetirar] = useState<P | null>(null);
  const [abastecer, setAbastecer] = useState(false);
  const visiveis = lista.filter((p) => (!busca.trim() || matchesSearch(busca.trim().toLowerCase(), p.name, p.code)) && (!soBaixo || abaixoDoMinimoAlmox(p)));
  const baixos = lista.filter(abaixoDoMinimoAlmox).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[12rem]">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar no almoxarifado" className="pl-8" />
        </div>
        <Button variant="outline" size="sm" onClick={() => setAbastecer(true)}>
          <ArrowRightLeft className="h-4 w-4 mr-1" /> Abastecer da loja
        </Button>
      </div>
      {baixos > 0 && (
        <button type="button" onClick={() => setSoBaixo((v) => !v)}
          className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${soBaixo ? 'border-orange-500 bg-orange-500/10' : 'border-orange-500/40 text-orange-500'}`}>
          {baixos} {baixos === 1 ? 'item está' : 'itens estão'} no mínimo ou abaixo no almoxarifado. {soBaixo ? 'Ver todos' : 'Ver só esses'}
        </button>
      )}
      {!lista.length ? (
        <p className="rounded-lg border border-border p-4 text-center text-sm text-muted-foreground">
          Nada no almoxarifado ainda. Use "Abastecer da loja" ou, no produto, "Movimentar → Entrada no almoxarifado".
        </p>
      ) : (
        <div className="space-y-1.5">
          {visiveis.map((p) => (
            <div key={p.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                <p className="text-xs text-muted-foreground">
                  {fmt(num(p.stock_almox))} {p.unit} no almoxarifado
                  {num(p.stock_minimo_almox) > 0 && <> · mínimo {fmt(num(p.stock_minimo_almox))}</>}
                  {num(p.stock_current) > 0 && <> · {fmt(num(p.stock_current))} na loja</>}
                </p>
              </div>
              {abaixoDoMinimoAlmox(p) && <span className="text-xs font-semibold text-orange-500">Baixo</span>}
              <Button size="sm" variant="outline" disabled={num(p.stock_almox) <= 0} onClick={() => setRetirar(p)}>
                <PackageMinus className="h-4 w-4 mr-1" /> Baixa sem OS
              </Button>
            </div>
          ))}
        </div>
      )}
      {retirar && <BaixaSemOs produto={retirar} equipe={equipe} onClose={() => setRetirar(null)} />}
      {abastecer && <Abastecer products={products as P[]} equipe={equipe} onClose={() => setAbastecer(false)} />}
    </div>
  );
}

function useAtualizarEstoque() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['inventory-products'] });
    qc.invalidateQueries({ queryKey: ['inventory-movements'] });
    qc.invalidateQueries({ queryKey: ['inventory-lotes'] });
  };
}

function QuemSelect({ equipe, valor, onChange, rotulo }: { equipe: string[]; valor: string; onChange: (v: string) => void; rotulo: string }) {
  if (!equipe.length) return null;
  return (
    <div className="space-y-1">
      <Label>{rotulo} *</Label>
      <Select value={valor || 'none'} onValueChange={(v) => onChange(v === 'none' ? '' : v)}>
        <SelectTrigger className={!valor ? 'border-destructive' : ''}><SelectValue placeholder="Selecione" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Selecione</SelectItem>
          {equipe.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Baixa sem OS: material que saiu do almoxarifado para uso da oficina (não é de nenhuma moto). */
function BaixaSemOs({ produto, equipe, onClose }: { produto: P; equipe: string[]; onClose: () => void }) {
  const { storeId } = useStore();
  const atualizar = useAtualizarEstoque();
  const saldo = num(produto.stock_almox);
  const conteudo = num(produto.conteudo_qtd) > 0 ? { qtd: num(produto.conteudo_qtd), un: produto.conteudo_unidade || 'ml' } : null;
  const [qtd, setQtd] = useState('1');
  const [parte, setParte] = useState<number | null>(null);
  const [medida, setMedida] = useState('');
  const [unMedida, setUnMedida] = useState(conteudo?.un ?? '');
  const [motivo, setMotivo] = useState(MOTIVOS_CONSUMO[0]);
  const [detalhe, setDetalhe] = useState('');
  const [quem, setQuem] = useState('');
  const [salvando, setSalvando] = useState(false);

  const medidaNum = parseFloat(medida.replace(',', '.')) || 0;
  const quantidade = parte ?? (conteudo && medidaNum > 0 ? (fracaoDaEmbalagem(medidaNum, unMedida || conteudo.un, conteudo.qtd, conteudo.un) ?? 0) : parseFloat(qtd.replace(',', '.')) || 0);

  const salvar = async () => {
    const q = qtdEstoque(quantidade);
    if (!(q > 0)) { toast.error('Informe quanto saiu.'); return; }
    if (q > saldo + 0.0005) { toast.error(`Só tem ${fmt(saldo)} ${produto.unit} no almoxarifado.`); return; }
    if (equipe.length && !quem) { toast.error('Selecione quem retirou.'); return; }
    if (motivo === 'Outro' && !detalhe.trim()) { toast.error('Escreva o motivo.'); return; }
    const parteTxt = parte ? ` (${textoParte(parte)} ${produto.unit})` : conteudo && medidaNum > 0 ? ` (${medida.replace('.', ',')} ${unMedida || conteudo.un})` : '';
    setSalvando(true);
    const { error } = await db.from('inventory_movements').insert({
      store_id: storeId, product_id: produto.id, type: 'consumo_interno', local: 'almox', quantity: q,
      notes: `${motivo}${detalhe.trim() ? ` — ${detalhe.trim()}` : ''}${parteTxt}`,
      ...(quem ? { retirado_por: quem, feito_por: quem } : {}),
    });
    setSalvando(false);
    if (error) { toast.error(`Não consegui dar baixa: ${error.message}`); return; }
    toast.success(`Baixa de ${fmt(q)} ${produto.unit} registrada.`);
    atualizar();
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Baixa sem OS</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">{produto.name} · {fmt(saldo)} {produto.unit} no almoxarifado</p>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Quanto saiu</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input inputMode="decimal" className="w-20" value={parte || medidaNum ? '' : qtd} placeholder={parte ? textoParte(parte) : '1'}
                onChange={(e) => { setQtd(e.target.value.replace(/[^\d.,]/g, '')); setParte(null); setMedida(''); }} />
              <span className="text-sm text-muted-foreground">{produto.unit}</span>
              {[0.25, 0.5, 0.75].map((f) => (
                <button key={f} type="button" onClick={() => { setParte(parte === f ? null : f); setMedida(''); }}
                  className={`rounded border px-2 py-0.5 text-xs ${parte === f ? 'border-[#C1272D] bg-[#C1272D]/15 font-semibold' : 'border-border text-muted-foreground'}`}>
                  {textoParte(f)}
                </button>
              ))}
            </div>
            {conteudo && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">ou</span>
                <Input inputMode="decimal" className="h-8 w-20" placeholder="50" value={medida}
                  onChange={(e) => { setMedida(e.target.value.replace(/[^\d.,]/g, '')); setParte(null); }} />
                <Select value={unMedida || conteudo.un} onValueChange={setUnMedida}>
                  <SelectTrigger className="h-8 w-16"><SelectValue /></SelectTrigger>
                  <SelectContent>{unidadesDoConteudo(conteudo.un).map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                </Select>
                <span className="text-muted-foreground">de {String(conteudo.qtd).replace('.', ',')} {conteudo.un}</span>
              </div>
            )}
            {quantidade > 0 && <p className="text-xs text-muted-foreground">Sai do almoxarifado: {fmt(quantidade)} {produto.unit}</p>}
          </div>
          <div className="space-y-1">
            <Label>Motivo</Label>
            <Select value={motivo} onValueChange={setMotivo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{MOTIVOS_CONSUMO.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
            <Input value={detalhe} onChange={(e) => setDetalhe(e.target.value)} placeholder={motivo === 'Outro' ? 'Escreva o motivo' : 'Detalhe (opcional)'} />
          </div>
          <QuemSelect equipe={equipe} valor={quem} onChange={setQuem} rotulo="Quem retirou" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando}>{salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Dar baixa'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Abastecer: leva vários itens da loja para o almoxarifado de uma vez (uma transferência por item). */
function Abastecer({ products, equipe, onClose }: { products: P[]; equipe: string[]; onClose: () => void }) {
  const { storeId } = useStore();
  const atualizar = useAtualizarEstoque();
  const [busca, setBusca] = useState('');
  const [qtds, setQtds] = useState<Record<string, string>>({});
  const [quem, setQuem] = useState('');
  const [salvando, setSalvando] = useState(false);
  const comLoja = useMemo(() => products
    .filter((p) => p.active !== false && !p.e_kit && num(p.stock_current) > 0)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), [products]);
  const visiveis = comLoja.filter((p) => !busca.trim() || matchesSearch(busca.trim().toLowerCase(), p.name, p.code));
  const escolhidos = comLoja
    .map((p) => ({ p, q: qtdEstoque(parseFloat((qtds[p.id] || '').replace(',', '.')) || 0) }))
    .filter((x) => x.q > 0);

  const salvar = async () => {
    if (!escolhidos.length) { toast.error('Digite a quantidade de pelo menos um item.'); return; }
    const passou = escolhidos.find((x) => x.q > num(x.p.stock_current) + 0.0005);
    if (passou) { toast.error(`${passou.p.name}: só tem ${fmt(num(passou.p.stock_current))} ${passou.p.unit} na loja.`); return; }
    if (equipe.length && !quem) { toast.error('Selecione quem está fazendo.'); return; }
    setSalvando(true);
    const { error } = await db.from('inventory_movements').insert(escolhidos.map(({ p, q }) => ({
      store_id: storeId, product_id: p.id, type: 'transf_para_almox', local: 'loja', quantity: q,
      notes: 'Abastecer almoxarifado', ...(quem ? { feito_por: quem } : {}),
    })));
    setSalvando(false);
    if (error) { toast.error(`Não consegui transferir: ${error.message}`); return; }
    toast.success(`${escolhidos.length} ${escolhidos.length === 1 ? 'item foi' : 'itens foram'} para o almoxarifado.`);
    atualizar();
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Abastecer o almoxarifado</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Digite quanto vai de cada item da loja para o almoxarifado.</p>
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar produto" className="pl-8" />
        </div>
        <div className="max-h-[45vh] overflow-y-auto space-y-1 pr-1">
          {!visiveis.length && <p className="text-sm text-muted-foreground text-center py-4">Nenhum produto com saldo na loja.</p>}
          {visiveis.map((p) => (
            <div key={p.id} className="flex items-center gap-2 rounded border border-border px-2 py-1.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{p.name}</p>
                <p className="text-xs text-muted-foreground">loja {fmt(num(p.stock_current))} · almox. {fmt(num(p.stock_almox))} {p.unit}</p>
              </div>
              <Input inputMode="decimal" className="h-8 w-20 text-right" placeholder="0" value={qtds[p.id] ?? ''}
                onChange={(e) => setQtds((q) => ({ ...q, [p.id]: e.target.value.replace(/[^\d.,]/g, '') }))} />
            </div>
          ))}
        </div>
        <QuemSelect equipe={equipe} valor={quem} onChange={setQuem} rotulo="Quem está fazendo?" />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando || !escolhidos.length}>
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : `Transferir ${escolhidos.length || ''} ${escolhidos.length === 1 ? 'item' : 'itens'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
