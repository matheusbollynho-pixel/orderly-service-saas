// Config › Nota fiscal › Contador: o dono libera um login para o contador ver as notas e baixar os XMLs.
// O contador não entra na equipe (não conta no limite do plano) e não vê nada além das notas.
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, UserX } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useStore } from '@/contexts/StoreContext';
import { Button } from '@/components/ui/button';
import { confirmar } from '@/components/v2/Confirmacao';
import { chamarFiscal } from '@/lib/fiscal';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const campo = 'w-full p-2 border border-white/20 rounded text-sm bg-black/30 text-neutral-200';

interface Acesso { id: string; email: string; created_at: string }

export function AcessoContador() {
  const { storeId } = useStore();
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [ocupado, setOcupado] = useState<string | null>(null);

  const { data: acessos = [] } = useQuery({
    queryKey: ['contador-acessos', storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await db.from('contador_acessos').select('id, email, created_at')
        .eq('store_id', storeId).eq('ativo', true).order('created_at');
      if (error) throw error;
      return (data ?? []) as Acesso[];
    },
  });

  const liberar = async () => {
    const e = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { toast.error('Digite o e-mail do contador.'); return; }
    setOcupado('novo');
    try {
      const r = await chamarFiscal<{ convidou: boolean }>({ acao: 'contador_convidar', email: e });
      toast.success(r.convidou
        ? `Convite enviado para ${e}. O contador cria a senha pelo e-mail.`
        : `${e} já tinha login: o acesso a esta loja já está liberado.`);
      setEmail('');
      qc.invalidateQueries({ queryKey: ['contador-acessos'] });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setOcupado(null);
    }
  };

  const tirar = async (a: Acesso) => {
    if (!(await confirmar({ titulo: 'Tirar o acesso do contador?', descricao: `${a.email} para de ver as notas desta loja na hora.`, verbo: 'Tirar acesso', perigo: true }))) return;
    setOcupado(a.id);
    try {
      await chamarFiscal({ acao: 'contador_remover', acesso_id: a.id });
      toast.success('Acesso retirado.');
      qc.invalidateQueries({ queryKey: ['contador-acessos'] });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setOcupado(null);
    }
  };

  return (
    <div className="space-y-2 pt-2 border-t border-white/10">
      <p className="text-xs text-neutral-400 font-medium">Login do contador</p>
      <p className="text-[11px] text-neutral-500">
        O contador entra em app.speedseekos.com.br com o e-mail dele, vê só as notas fiscais e baixa os XMLs do mês.
        Não vê caixa, clientes nem configurações e não conta no limite de usuários do plano.
      </p>
      {acessos.map((a) => (
        <div key={a.id} className="flex items-center justify-between gap-2 rounded border border-white/10 px-2 py-1.5">
          <span className="text-sm text-neutral-200 truncate">{a.email}</span>
          <Button size="sm" variant="ghost" className="text-red-400 shrink-0" disabled={ocupado === a.id} onClick={() => tirar(a)}>
            {ocupado === a.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserX className="h-4 w-4" />} Tirar acesso
          </Button>
        </div>
      ))}
      <div className="flex gap-2">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="e-mail do contador" className={campo}
          onKeyDown={(e) => { if (e.key === 'Enter') liberar(); }} />
        <Button size="sm" onClick={liberar} disabled={ocupado === 'novo'} className="shrink-0">
          {ocupado === 'novo' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Dar acesso'}
        </Button>
      </div>
    </div>
  );
}
