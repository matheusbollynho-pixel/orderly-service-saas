// Devolução de um item de nota do balcão já finalizada (ou no fiado). O banco faz tudo junto
// (devolver_item_balcao): volta o produto ao estoque, tira do caixa (ou abate do fiado) e registra.
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export interface Devolucao { id: string; item_id: string | null; quantidade: number; valor: number; forma: string; motivo: string; feito_por: string | null; created_at: string }

/** Devoluções já feitas de uma nota. */
export function useDevolucoes(orderId: string, ativo: boolean) {
  return useQuery({
    queryKey: ['balcao-devolucoes', orderId],
    enabled: ativo,
    queryFn: async () => {
      const { data, error } = await db.from('balcao_devolucoes').select('*').eq('order_id', orderId).order('created_at');
      if (error) throw error;
      return (data ?? []) as Devolucao[];
    },
  });
}

const MOTIVOS = ['Cliente desistiu', 'Peça com defeito', 'Peça errada / não serviu', 'Outro'];
const FORMAS: { v: string; nome: string }[] = [
  { v: 'dinheiro', nome: 'Dinheiro' }, { v: 'pix', nome: 'Pix' }, { v: 'cartao_credito', nome: 'Estorno no crédito' },
  { v: 'cartao_debito', nome: 'Estorno no débito' }, { v: 'transferencia', nome: 'Transferência' },
];

export function DevolverItemDialog({ item, restante, descontoPct, noFiado, onClose }: {
  item: { id: string; description: string; unit_price: number };
  restante: number; descontoPct: number; noFiado: boolean; onClose: () => void;
}) {
  const qc = useQueryClient();
  const [qtd, setQtd] = useState(String(restante));
  const [forma, setForma] = useState(noFiado ? 'abater_fiado' : 'dinheiro');
  const [motivo, setMotivo] = useState(MOTIVOS[0]);
  const [detalhe, setDetalhe] = useState('');
  const [salvando, setSalvando] = useState(false);
  const q = parseFloat(qtd.replace(',', '.')) || 0;
  const valor = Math.round(q * item.unit_price * (1 - (descontoPct || 0) / 100) * 100) / 100;

  const confirmar = async () => {
    if (!(q > 0)) { toast.error('Informe quantas unidades voltaram.'); return; }
    if (q > restante + 0.0005) { toast.error(`Só dá para devolver ${restante}.`); return; }
    if (motivo === 'Outro' && !detalhe.trim()) { toast.error('Escreva o motivo.'); return; }
    setSalvando(true);
    const { data, error } = await db.rpc('devolver_item_balcao', {
      p_item_id: item.id, p_qtd: q, p_forma: forma, p_motivo: detalhe.trim() ? `${motivo} — ${detalhe.trim()}` : motivo,
    });
    setSalvando(false);
    if (error) { toast.error(error.message); return; }
    toast.success(forma === 'abater_fiado'
      ? `Devolução registrada: ${brl(Number(data?.valor) || 0)} abatidos do fiado.`
      : `Devolução registrada: ${brl(Number(data?.valor) || 0)} saíram do caixa.`);
    for (const k of ['balcao-devolucoes', 'balcao-orders', 'cash-flow', 'cash-flow-summary', 'inventory-products', 'inventory-movements', 'fiados', 'fiado-cliente']) {
      qc.invalidateQueries({ queryKey: [k] });
    }
    window.dispatchEvent(new Event('sync:fiados'));
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Devolver item</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">{item.description} · pode devolver até {restante}</p>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Quantidade que voltou</Label>
            <Input inputMode="decimal" value={qtd} onChange={(e) => setQtd(e.target.value.replace(/[^\d.,]/g, ''))} className="w-28" />
          </div>
          <div className="space-y-1">
            <Label>Como devolve o valor</Label>
            <Select value={forma} onValueChange={setForma}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {noFiado && <SelectItem value="abater_fiado">Abater do fiado do cliente</SelectItem>}
                {FORMAS.map((f) => <SelectItem key={f.v} value={f.v}>{f.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Motivo</Label>
            <Select value={motivo} onValueChange={setMotivo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{MOTIVOS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
            <Input value={detalhe} onChange={(e) => setDetalhe(e.target.value)} placeholder={motivo === 'Outro' ? 'Escreva o motivo' : 'Detalhe (opcional)'} />
          </div>
          {q > 0 && (
            <p className="text-sm">
              Valor da devolução: <strong>{brl(valor)}</strong>{descontoPct > 0 && <span className="text-xs text-muted-foreground"> (com o desconto de {descontoPct}% da nota)</span>}
              <span className="block text-xs text-muted-foreground">
                {forma === 'abater_fiado' ? 'Diminui o que o cliente deve no fiado.' : 'Sai do caixa de hoje.'} O produto volta para o estoque. A nota fiscal não muda.
              </span>
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={confirmar} disabled={salvando}>{salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmar devolução'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
