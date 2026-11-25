// Números de NFC-e pulados (nota recusada pela SEFAZ não usa o número) precisam ser INUTILIZADOS na SEFAZ.
// Este bloco acha esses números sozinho e inutiliza por faixa; mostra também o histórico.
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Ban, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useStore } from '@/contexts/StoreContext';
import { Button } from '@/components/ui/button';
import { pedirTexto } from '@/components/v2/Confirmacao';
import { chamarFiscal, faixasSeguidas, textoFaixa } from '@/lib/fiscal';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface Inut { id: string; serie: string; numero_de: number; numero_ate: number; motivo: string; status: string; retorno: string | null; created_at: string }

export function NumerosParaInutilizar({ ambiente }: { ambiente: 'sandbox' | 'producao' }) {
  const { storeId } = useStore();
  const qc = useQueryClient();
  const [enviando, setEnviando] = useState(false);
  const [verHistorico, setVerHistorico] = useState(false);

  const pulados = useQuery({
    queryKey: ['fiscal-pulados', storeId, ambiente],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await db.from('notas_fiscais').select('serie, numero')
        .eq('store_id', storeId).eq('modelo', 'nfce').eq('ambiente', ambiente).in('status', ['rejeitada', 'erro'])
        .not('numero', 'is', null).limit(1000);
      if (error) throw error;
      const porSerie = new Map<string, number[]>();
      for (const n of (data ?? []) as { serie: string | null; numero: number }[]) {
        const s = n.serie ?? '1';
        porSerie.set(s, [...(porSerie.get(s) ?? []), Number(n.numero)]);
      }
      return [...porSerie.entries()].map(([serie, nums]) => ({ serie, faixas: faixasSeguidas(nums) }));
    },
  });
  const historico = useQuery({
    queryKey: ['fiscal-inutilizacoes', storeId, ambiente],
    enabled: !!storeId && verHistorico,
    queryFn: async () => {
      const { data, error } = await db.from('fiscal_inutilizacoes').select('*').eq('store_id', storeId).eq('ambiente', ambiente)
        .order('created_at', { ascending: false }).limit(30);
      if (error) throw error;
      return (data ?? []) as Inut[];
    },
  });

  const grupos = pulados.data ?? [];
  const total = grupos.reduce((s, g) => s + g.faixas.reduce((t, [a, b]) => t + (b - a + 1), 0), 0);

  const inutilizar = async () => {
    const lista = grupos.map((g) => `série ${g.serie}: ${g.faixas.map(textoFaixa).join(', ')}`).join(' · ');
    const motivo = await pedirTexto({
      titulo: `Inutilizar ${total} ${total === 1 ? 'número' : 'números'}?`,
      descricao: `${lista}. São números de notas recusadas pela SEFAZ, que ficaram sem uso. A SEFAZ exige que sejam inutilizados.`,
      rotulo: 'Motivo (mínimo 15 letras)', valorInicial: 'Numeracao nao utilizada: notas rejeitadas pela SEFAZ', obrigatorio: true, verbo: 'Inutilizar',
    });
    if (!motivo) return;
    if (motivo.trim().length < 15) { toast.error('O motivo precisa ter pelo menos 15 letras.'); return; }
    setEnviando(true);
    let ok = 0;
    const falhas: string[] = [];
    for (const g of grupos) {
      for (const f of g.faixas) {
        try {
          const r = await chamarFiscal<{ status: string; motivo?: string | null }>({ acao: 'inutilizar', serie: g.serie, de: f[0], ate: f[1], motivo: motivo.trim() });
          if (r.status === 'rejeitada') falhas.push(`${textoFaixa(f)}: ${r.motivo ?? 'recusada'}`); else ok++;
        } catch (e) {
          falhas.push(`${textoFaixa(f)}: ${(e as Error).message}`);
        }
      }
    }
    setEnviando(false);
    if (falhas.length) toast.error(`Não inutilizou ${falhas.join(' | ')}`);
    if (ok) toast.success('Pedido de inutilização enviado à SEFAZ.');
    setVerHistorico(true);
    qc.invalidateQueries({ queryKey: ['fiscal-pulados'] });
    qc.invalidateQueries({ queryKey: ['fiscal-inutilizacoes'] });
    qc.invalidateQueries({ queryKey: ['notas-fiscais'] });
  };
  const consultar = async (i: Inut) => {
    try { await chamarFiscal({ acao: 'consultar_inutilizacao', inutilizacao_id: i.id }); } catch (e) { toast.error((e as Error).message); }
    qc.invalidateQueries({ queryKey: ['fiscal-inutilizacoes'] });
    qc.invalidateQueries({ queryKey: ['fiscal-pulados'] });
  };

  return (
    <div className="space-y-2">
      {total > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-amber-600">{total} {total === 1 ? 'número pulado' : 'números pulados'} para inutilizar</p>
            <p className="text-[11px] text-muted-foreground">
              {grupos.map((g) => `Série ${g.serie}: ${g.faixas.map(textoFaixa).join(', ')}`).join(' · ')} — notas recusadas não usam o número; a SEFAZ exige inutilizar.
            </p>
          </div>
          <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={enviando} onClick={inutilizar}>
            {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />} Inutilizar
          </Button>
        </div>
      )}
      <button type="button" className="text-xs text-muted-foreground underline-offset-2 hover:underline" onClick={() => setVerHistorico((v) => !v)}>
        {verHistorico ? 'Esconder inutilizações' : 'Ver inutilizações feitas'}
      </button>
      {verHistorico && (
        <div className="space-y-1">
          {(historico.data ?? []).length === 0 ? <p className="text-xs text-muted-foreground">Nenhuma inutilização ainda.</p>
            : historico.data!.map((i) => (
              <div key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-2.5 py-1.5 text-xs">
                <span>Série {i.serie} · nº {textoFaixa([Number(i.numero_de), Number(i.numero_ate)])} · {new Date(i.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                <span className={i.status === 'inutilizada' ? 'text-emerald-500' : i.status === 'rejeitada' ? 'text-red-500' : 'text-amber-500'}>
                  {i.status === 'inutilizada' ? 'Inutilizada' : i.status === 'rejeitada' ? `Recusada${i.retorno ? `: ${i.retorno}` : ''}` : 'Processando'}
                  {i.status === 'processando' && <Button size="sm" variant="ghost" className="ml-1 h-6 text-[11px]" onClick={() => consultar(i)}>Consultar</Button>}
                </span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
