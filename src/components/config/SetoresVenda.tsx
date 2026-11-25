// Ajustes > Loja > Setores da venda (ex.: Balcão, Online, Estofaria).
// A nota de balcão e a OS já saem no setor padrão; o caixa e os relatórios separam por setor.
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSetores, type SetorVenda } from '@/hooks/useSetores';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export function SetoresVenda() {
  const qc = useQueryClient();
  const { setores, isLoading } = useSetores();
  const [novo, setNovo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const recarregar = () => qc.invalidateQueries({ queryKey: ['setores-venda'] });

  const criar = async () => {
    const nome = novo.trim();
    if (!nome) return;
    if (setores.some((s) => s.nome.toLowerCase() === nome.toLowerCase())) { toast.error('Já existe um setor com esse nome.'); return; }
    setSalvando(true);
    // O primeiro setor vira o padrão das notas e das OS (dá para trocar depois)
    const primeiro = setores.length === 0;
    const { error } = await db.from('setores_venda').insert({ nome, ordem: setores.length, padrao_balcao: primeiro, padrao_os: primeiro });
    setSalvando(false);
    if (error) { toast.error('Não consegui criar: ' + error.message); return; }
    setNovo('');
    recarregar();
  };

  const mudar = async (s: SetorVenda, campos: Partial<SetorVenda>) => {
    // Padrão é um só por loja: desmarca o anterior antes
    if (campos.padrao_balcao) await db.from('setores_venda').update({ padrao_balcao: false }).eq('padrao_balcao', true).neq('id', s.id);
    if (campos.padrao_os) await db.from('setores_venda').update({ padrao_os: false }).eq('padrao_os', true).neq('id', s.id);
    const { error } = await db.from('setores_venda').update(campos).eq('id', s.id);
    if (error) { toast.error('Não consegui salvar: ' + error.message); recarregar(); return; }
    recarregar();
  };

  const renomear = async (s: SetorVenda, nome: string) => {
    const n = nome.trim();
    if (!n || n === s.nome) return;
    await mudar(s, { nome: n });
  };

  return (
    <div className="space-y-2">
      <p className="text-sm text-neutral-200 font-medium">Setores da venda</p>
      <p className="text-xs text-neutral-500">
        Ex.: Balcão, Online, Estofaria. A nota de balcão e a OS já saem no setor padrão (dá para trocar na nota),
        e o Caixa e os Relatórios separam o que entrou em cada setor. Sem setor cadastrado, nada muda.
      </p>
      {isLoading ? <p className="text-xs text-neutral-500">Carregando...</p> : setores.map((s) => (
        <div key={s.id} className={`rounded-lg border border-white/10 p-2 space-y-1.5 ${s.ativo ? '' : 'opacity-60'}`}>
          <Input defaultValue={s.nome} className="h-8" onBlur={(e) => renomear(s, e.target.value)} />
          <div className="flex flex-wrap gap-3 text-xs text-neutral-300">
            <label className="flex items-center gap-1.5">
              <input type="radio" className="h-4 w-4" name="padrao_balcao" checked={s.padrao_balcao} disabled={!s.ativo} onChange={() => mudar(s, { padrao_balcao: true })} />
              Padrão das notas de balcão
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" className="h-4 w-4" name="padrao_os" checked={s.padrao_os} disabled={!s.ativo} onChange={() => mudar(s, { padrao_os: true })} />
              Padrão das OS
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" className="h-4 w-4" checked={s.ativo} onChange={(e) => mudar(s, e.target.checked ? { ativo: true } : { ativo: false, padrao_balcao: false, padrao_os: false })} />
              Ativo
            </label>
          </div>
        </div>
      ))}
      <div className="flex gap-2">
        <Input className="h-8" placeholder={setores.length === 0 ? 'Ex.: Balcão' : 'Novo setor (ex.: Online)'} value={novo}
          onChange={(e) => setNovo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && criar()} />
        <Button size="sm" variant="outline" disabled={salvando || !novo.trim()} onClick={criar}><Plus className="h-4 w-4 mr-1" /> Adicionar</Button>
      </div>
    </div>
  );
}
