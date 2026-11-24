// Editor do checklist da OS (Ajustes → Loja). Cada loja monta o próprio checklist
// de moto e/ou carro. Sem modelo salvo, a OS usa o checklist padrão do sistema.
import { useState } from 'react';
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { confirmar } from '@/components/v2/Confirmacao';
import { getDefaultChecklistItems, type ChecklistModeloItem } from '@/types/service-order';

const TIPOS: { value: ChecklistModeloItem['type']; label: string }[] = [
  { value: 'yesno', label: 'Sim / Não' },
  { value: 'rating', label: 'Estrelas (0 a 5)' },
  { value: 'textarea', label: 'Texto livre' },
];

function padrao(tipo: 'moto' | 'carro'): ChecklistModeloItem[] {
  return getDefaultChecklistItems(tipo).map(i => ({ label: i.label, type: i.type }));
}

interface Props {
  storeId: string;
  tipo: 'moto' | 'carro';
  salvo: ChecklistModeloItem[] | null | undefined;
}

export function ChecklistEditor({ storeId, tipo, salvo }: Props) {
  const coluna = tipo === 'carro' ? 'checklist_carro' : 'checklist_moto';
  const [personalizado, setPersonalizado] = useState<boolean>(Array.isArray(salvo) && salvo.length > 0);
  const [itens, setItens] = useState<ChecklistModeloItem[]>(
    Array.isArray(salvo) && salvo.length > 0 ? salvo : padrao(tipo)
  );
  const [salvando, setSalvando] = useState(false);

  const mudar = (i: number, campo: Partial<ChecklistModeloItem>) =>
    setItens(lista => lista.map((it, j) => (j === i ? { ...it, ...campo } : it)));
  const mover = (i: number, d: -1 | 1) =>
    setItens(lista => {
      const j = i + d;
      if (j < 0 || j >= lista.length) return lista;
      const nova = [...lista];
      [nova[i], nova[j]] = [nova[j], nova[i]];
      return nova;
    });
  const remover = (i: number) => setItens(lista => lista.filter((_, j) => j !== i));
  const adicionar = () => setItens(lista => [...lista, { label: '', type: 'yesno' }]);

  async function gravar(valor: ChecklistModeloItem[] | null) {
    setSalvando(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from('store_settings').update({ [coluna]: valor }).eq('id', storeId);
    setSalvando(false);
    if (error) {
      toast.error('Não consegui salvar o checklist: ' + error.message);
      return false;
    }
    return true;
  }

  async function salvar() {
    const limpos = itens.map(i => ({ ...i, label: i.label.trim() })).filter(i => i.label);
    if (limpos.length === 0) {
      toast.error('Coloque pelo menos um item no checklist.');
      return;
    }
    const nomes = limpos.map(i => i.label.toLowerCase());
    if (new Set(nomes).size !== nomes.length) {
      toast.error('Tem item com o nome repetido. Cada item precisa de um nome diferente.');
      return;
    }
    if (await gravar(limpos)) {
      setItens(limpos);
      setPersonalizado(true);
      toast.success(`Checklist de ${tipo} salvo. Vale para as OS novas.`);
    }
  }

  async function voltarPadrao() {
    const ok = await confirmar({
      titulo: `Voltar ao checklist padrão de ${tipo}?`,
      descricao: 'O checklist que você montou será apagado. As OS já abertas não mudam.',
      verbo: 'Voltar ao padrão',
      perigo: true,
    });
    if (!ok) return;
    if (await gravar(null)) {
      setItens(padrao(tipo));
      setPersonalizado(false);
      toast.success(`Checklist de ${tipo} voltou ao padrão.`);
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-white/10 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-neutral-200">Checklist de {tipo === 'carro' ? 'carro' : 'moto'}</p>
        <span className="text-xs text-neutral-500">{personalizado ? 'Personalizado' : 'Padrão do sistema'}</span>
      </div>

      {itens.map((item, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={item.label}
            onChange={e => mudar(i, { label: e.target.value })}
            placeholder="Nome do item (ex.: Estado do banco)"
            className="min-w-[180px] flex-1 p-2 border border-white/20 rounded text-sm bg-black/30 text-neutral-200"
          />
          <select
            title="Tipo de resposta"
            value={item.type}
            onChange={e => mudar(i, { type: e.target.value as ChecklistModeloItem['type'] })}
            className="p-2 border border-white/20 rounded text-sm bg-black/30 text-neutral-200"
          >
            {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <div className="flex gap-1">
            <Button type="button" size="icon" variant="ghost" aria-label="Subir" disabled={i === 0} onClick={() => mover(i, -1)}><ArrowUp className="h-4 w-4" /></Button>
            <Button type="button" size="icon" variant="ghost" aria-label="Descer" disabled={i === itens.length - 1} onClick={() => mover(i, 1)}><ArrowDown className="h-4 w-4" /></Button>
            <Button type="button" size="icon" variant="ghost" aria-label="Remover item" onClick={() => remover(i)}><Trash2 className="h-4 w-4" /></Button>
          </div>
        </div>
      ))}

      <div className="flex flex-wrap gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" onClick={adicionar}><Plus className="h-4 w-4 mr-1" />Adicionar item</Button>
        <Button type="button" size="sm" onClick={salvar} disabled={salvando}>
          {salvando && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Salvar checklist
        </Button>
        {personalizado && (
          <Button type="button" variant="ghost" size="sm" onClick={voltarPadrao} disabled={salvando}>Voltar ao padrão</Button>
        )}
      </div>
    </div>
  );
}
