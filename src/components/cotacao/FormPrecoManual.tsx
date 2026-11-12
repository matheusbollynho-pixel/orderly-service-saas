import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import type { useCotacao } from '@/hooks/useCotacao';

type Cot = ReturnType<typeof useCotacao>;

const INTERNET = ['Mercado Livre', 'Shopee', 'Outro site'];

/**
 * Preço digitado à mão: o representante passou por telefone/pessoalmente, ou
 * você achou na internet. Entra na comparação igual aos outros.
 */
export function FormPrecoManual({ itemId, cot, onFim }: { itemId: string; cot: Cot; onFim?: () => void }) {
  const reps = cot.representantes.filter((r) => r.ativo);
  const [origem, setOrigem] = useState<string>(reps[0]?.id ?? 'net:Mercado Livre');
  const [preco, setPreco] = useState('');
  const [frete, setFrete] = useState('');
  const [marca, setMarca] = useState('');
  const [obs, setObs] = useState('');
  const [link, setLink] = useState('');
  const internet = origem.startsWith('net:');
  const num = (v: string) => (v.trim() ? Number(v.replace(/\./g, '').replace(',', '.')) : null);

  const salvar = () => {
    const p = num(preco);
    if (p == null || Number.isNaN(p) || p <= 0) return toast.error('Informe o preço');
    const f = num(frete);
    cot.adicionarPrecoManual.mutate(
      {
        item_id: itemId,
        representante_id: internet ? null : origem,
        loja_internet: internet ? origem.slice(4) : null,
        preco: p,
        frete: internet && f != null && !Number.isNaN(f) ? f : null,
        marca: marca.trim() || null,
        link: internet ? link.trim() || null : null,
        obs: obs.trim() || null,
      },
      { onSuccess: () => { setPreco(''); setFrete(''); setMarca(''); setObs(''); setLink(''); onFim?.(); } },
    );
  };

  return (
    <div className="grid grid-cols-2 gap-2 rounded-md border p-2">
      <div className="col-span-2">
        <Select value={origem} onValueChange={setOrigem}>
          <SelectTrigger><SelectValue placeholder="De quem é esse preço?" /></SelectTrigger>
          <SelectContent>
            {reps.map((r) => <SelectItem key={r.id} value={r.id}>{r.nome} (telefone / pessoalmente)</SelectItem>)}
            {INTERNET.map((n) => <SelectItem key={n} value={`net:${n}`}>Internet: {n}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <Input placeholder="Preço (ex: 89,90)" inputMode="decimal" value={preco} onChange={(e) => setPreco(e.target.value)} />
      <Input placeholder="Marca (opcional)" value={marca} onChange={(e) => setMarca(e.target.value)} />
      {internet && (
        <>
          <Input placeholder="Frete pro CEP da loja" inputMode="decimal" value={frete} onChange={(e) => setFrete(e.target.value)} />
          <Input placeholder="Link do anúncio (opcional)" value={link} onChange={(e) => setLink(e.target.value)} />
        </>
      )}
      <Input className="col-span-2" placeholder="Observação (opcional)" value={obs} onChange={(e) => setObs(e.target.value)} />
      <Button size="sm" className="col-span-2" onClick={salvar} disabled={cot.adicionarPrecoManual.isPending}>Salvar preço</Button>
    </div>
  );
}
