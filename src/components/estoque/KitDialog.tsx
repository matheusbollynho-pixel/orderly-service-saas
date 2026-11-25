// Estoque > Kit: produto que é um conjunto de outros (ex.: "Kit capa de banco" = 2 capas + 1 cola).
// Mostra a soma das peças e o dono escolhe o preço do kit. O banco dá baixa nas peças ao vender
// e calcula sozinho quantos kits dá para montar (salvar_kit / fn_kit_*).
import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { InventoryProduct } from '@/hooks/useInventory';
import { matchesSearch } from '@/lib/textSearch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
type Prod = InventoryProduct & { e_kit?: boolean | null };
interface Peca { componente_id: string; quantidade: string }

interface Props {
  open: boolean;
  kit: InventoryProduct | null; // null = kit novo
  products: InventoryProduct[];
  onClose: () => void;
}

export function KitDialog({ open, kit, products, onClose }: Props) {
  const qc = useQueryClient();
  const [nome, setNome] = useState('');
  const [preco, setPreco] = useState('');
  const [pecas, setPecas] = useState<Peca[]>([]);
  const [busca, setBusca] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const porId = useMemo(() => new Map((products as Prod[]).map((p) => [p.id, p])), [products]);

  useEffect(() => {
    if (!open) return;
    setBusca('');
    if (!kit) { setNome(''); setPreco(''); setPecas([]); return; }
    setNome(kit.name);
    setPreco(String(kit.sale_price ?? ''));
    setCarregando(true);
    db.from('kit_itens').select('componente_id, quantidade').eq('kit_id', kit.id).then(({ data }: { data: { componente_id: string; quantidade: number }[] | null }) => {
      setPecas((data ?? []).map((x) => ({ componente_id: x.componente_id, quantidade: String(Number(x.quantidade)) })));
      setCarregando(false);
    });
  }, [open, kit]);

  const num = (v: string) => parseFloat(String(v).replace(',', '.')) || 0;
  const soma = pecas.reduce((s, x) => s + num(x.quantidade) * (Number(porId.get(x.componente_id)?.sale_price) || 0), 0);
  const custo = pecas.reduce((s, x) => s + num(x.quantidade) * (Number(porId.get(x.componente_id)?.cost_price) || 0), 0);
  const montaveis = pecas.length ? Math.min(...pecas.map((x) => Math.floor((Number(porId.get(x.componente_id)?.stock_current) || 0) / (num(x.quantidade) || 1)))) : 0;
  const precoKit = preco.trim() ? num(preco) : soma;
  const desconto = soma - precoKit;
  const sugestoes = busca.trim()
    ? (products as Prod[]).filter((p) => p.active !== false && !p.e_kit && p.id !== kit?.id && !pecas.some((x) => x.componente_id === p.id) && matchesSearch(busca.trim(), p.name, p.code)).slice(0, 8)
    : [];

  const salvar = async () => {
    if (!nome.trim()) { toast.error('Dê um nome ao kit.'); return; }
    if (pecas.length === 0) { toast.error('Coloque pelo menos uma peça no kit.'); return; }
    if (pecas.some((x) => !(num(x.quantidade) > 0))) { toast.error('Quantidade de peça inválida.'); return; }
    setSalvando(true);
    const { error } = await db.rpc('salvar_kit', {
      p: { id: kit?.id ?? null, name: nome.trim(), sale_price: Math.round(precoKit * 100) / 100, itens: pecas.map((x) => ({ componente_id: x.componente_id, quantidade: num(x.quantidade) })) },
    });
    setSalvando(false);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ['inventory-products'] });
    toast.success(kit ? 'Kit atualizado' : 'Kit criado');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{kit ? 'Editar kit' : 'Novo kit'}</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">
          O kit aparece na nota e na OS como um produto. Ao vender, sai do estoque cada peça. O estoque do kit é quantos dá para montar com as peças.
        </p>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Nome do kit</Label>
          <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Kit capa de banco completa" />
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Peças do kit</Label>
          {carregando ? <p className="text-xs text-muted-foreground">Carregando...</p> : pecas.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma peça ainda. Busque abaixo.</p>
          ) : pecas.map((x, i) => {
            const p = porId.get(x.componente_id);
            return (
              <div key={x.componente_id} className="flex items-center gap-2 rounded-lg border px-2 py-1.5">
                <Input className="h-8 w-16" inputMode="decimal" value={x.quantidade}
                  onChange={(e) => setPecas((ps) => ps.map((y, k) => (k === i ? { ...y, quantidade: e.target.value } : y)))} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{p?.name ?? 'Produto removido'}</p>
                  <p className="text-[11px] text-muted-foreground">{p?.code} · {brl(Number(p?.sale_price) || 0)} cada · estoque {p?.stock_current ?? 0} {p?.unit}</p>
                </div>
                <span className="text-sm tabular-nums">{brl(num(x.quantidade) * (Number(p?.sale_price) || 0))}</span>
                <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setPecas((ps) => ps.filter((_, k) => k !== i))}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
          <div className="relative">
            <Input className="h-8" placeholder="Adicionar peça: buscar pelo nome ou código" value={busca} onChange={(e) => setBusca(e.target.value)} />
            {sugestoes.length > 0 && (
              <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg max-h-52 overflow-y-auto">
                {sugestoes.map((p) => (
                  <button key={p.id} type="button" className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted"
                    onMouseDown={(e) => { e.preventDefault(); setPecas((ps) => [...ps, { componente_id: p.id, quantidade: '1' }]); setBusca(''); }}>
                    <span className="font-medium">{p.name}</span> <span className="text-muted-foreground">· {p.code} · {brl(Number(p.sale_price) || 0)} · estoque {p.stock_current} {p.unit}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-lg border p-2.5 space-y-2">
          <div className="flex justify-between text-sm"><span>Soma das peças (preço de venda)</span><b>{brl(soma)}</b></div>
          <div className="flex justify-between text-xs text-muted-foreground"><span>Custo das peças</span><span>{brl(custo)}</span></div>
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <Label className="text-xs text-muted-foreground">Preço do kit (R$)</Label>
              <Input inputMode="decimal" value={preco} onChange={(e) => setPreco(e.target.value)} placeholder={soma ? soma.toFixed(2) : '0,00'} />
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => setPreco(soma.toFixed(2))}>Usar a soma</Button>
          </div>
          {pecas.length > 0 && (
            <p className={`text-xs ${precoKit < custo ? 'text-red-500' : desconto > 0.004 ? 'text-emerald-500' : 'text-muted-foreground'}`}>
              {precoKit < custo
                ? `Atenção: o kit sai abaixo do custo das peças (${brl(custo)}).`
                : desconto > 0.004
                  ? `Desconto do kit: ${brl(desconto)} (${soma ? Math.round((desconto / soma) * 100) : 0}% sobre a soma). Lucro: ${brl(precoKit - custo)}.`
                  : desconto < -0.004 ? `O kit sai ${brl(-desconto)} acima da soma das peças. Lucro: ${brl(precoKit - custo)}.` : `Mesmo preço da soma. Lucro: ${brl(precoKit - custo)}.`}
            </p>
          )}
          {pecas.length > 0 && <p className="text-xs text-muted-foreground">Com o estoque de hoje dá para montar <b>{Math.max(montaveis, 0)}</b> kit(s).</p>}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando}>{salvando && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}{kit ? 'Salvar kit' : 'Criar kit'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
