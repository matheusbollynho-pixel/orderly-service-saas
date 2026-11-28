// Relatórios › Vendas › Recebido por empresa: para loja com dois CNPJs (vendas/peças e serviços).
// Dinheiro que entrou no caixa, dividido: nota do balcão e peças da OS → empresa de vendas;
// mão de obra da OS → empresa de serviços; lançado à mão sem origem → separado.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useStore } from '@/contexts/StoreContext';
import { useStoreSettings } from '@/hooks/useStoreSettings';
import { baixarPlanilha } from '@/lib/planilha';
import { Button } from '@/components/ui/button';
import type { Periodo } from '@/lib/periodo';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtCnpj = (c?: string | null) => {
  const d = (c ?? '').replace(/\D/g, '');
  return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : d;
};
const FORMAS: Record<string, string> = {
  dinheiro: 'Dinheiro', pix: 'Pix', cartao: 'Cartão', cartao_credito: 'Crédito', cartao_debito: 'Débito',
  credito: 'Crédito', debito: 'Débito', transferencia: 'Transferência', outro: 'Outros',
};
const ORIGENS: Record<string, string> = {
  balcao: 'Notas do balcão', fiado: 'Fiado recebido', os_pecas: 'Peças das OS', os_servicos: 'Mão de obra das OS', manual: 'Lançado à mão',
};
interface Empresa { total: number; por_origem?: Record<string, number> | null; por_forma?: Record<string, number> | null }

export function RecebidoPorEmpresa({ periodo }: { periodo: Periodo }) {
  const { storeId } = useStore();
  const { settings } = useStoreSettings();
  const s = settings as { servicos_cnpj?: string | null; servicos_razao_social?: string | null; store_cnpj?: string | null; company_name?: string | null } | null;
  const temDois = !!s?.servicos_cnpj;
  const { data } = useQuery({
    queryKey: ['recebido-por-empresa', storeId, periodo.ini, periodo.fim],
    enabled: !!storeId && temDois,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await db.rpc('recebido_por_empresa', { p_store_id: storeId, p_ini: periodo.ini, p_fim: periodo.fim });
      if (error) throw error;
      return (data?.empresas ?? {}) as Record<string, Empresa>;
    },
  });
  if (!temDois || !data) return null;

  const blocos: { chave: string; nome: string; cnpj?: string | null }[] = [
    { chave: 'vendas', nome: s?.company_name || 'Empresa de vendas', cnpj: s?.store_cnpj },
    { chave: 'servicos', nome: s?.servicos_razao_social || 'Empresa de serviços', cnpj: s?.servicos_cnpj },
  ];
  const semOrigem = data.sem_origem;

  return (
    <section className="rounded-xl border bg-card p-3 space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">Recebido por empresa (CNPJ)</h3>
        <Button size="sm" variant="outline" className="ml-auto" onClick={() => baixarPlanilha(`recebido-por-empresa-${periodo.ini}-a-${periodo.fim}`,
          ['Empresa', 'CNPJ', 'Origem', 'Valor'],
          [...blocos.flatMap((b) => Object.entries(data[b.chave]?.por_origem ?? {}).map(([o, v]) => [b.nome, fmtCnpj(b.cnpj), ORIGENS[o] ?? o, v])),
           ...Object.entries(semOrigem?.por_origem ?? {}).map(([o, v]) => ['Sem origem', '', ORIGENS[o] ?? o, v])])}>
          Baixar planilha
        </Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {blocos.map((b) => {
          const e = data[b.chave];
          return (
            <div key={b.chave} className="rounded-lg border border-border p-3 space-y-1">
              <p className="text-xs text-muted-foreground">{b.nome}{b.cnpj ? ` · ${fmtCnpj(b.cnpj)}` : ''}</p>
              <p className="text-lg font-bold tabular-nums">{brl(Number(e?.total) || 0)}</p>
              {Object.entries(e?.por_origem ?? {}).map(([o, v]) => (
                <div key={o} className="flex justify-between text-xs"><span className="text-muted-foreground">{ORIGENS[o] ?? o}</span><span className="tabular-nums">{brl(Number(v))}</span></div>
              ))}
              {e?.por_forma && Object.keys(e.por_forma).length > 0 && (
                <p className="text-[11px] text-muted-foreground pt-1">
                  {Object.entries(e.por_forma).map(([f, v]) => `${FORMAS[f] ?? f} ${brl(Number(v))}`).join(' · ')}
                </p>
              )}
            </div>
          );
        })}
      </div>
      {semOrigem && Math.abs(Number(semOrigem.total)) >= 0.01 && (
        <p className="text-xs text-muted-foreground">Lançado à mão no caixa, sem OS ou nota (não dá para saber a empresa): <strong className="text-foreground">{brl(Number(semOrigem.total))}</strong></p>
      )}
      <p className="text-[11px] text-muted-foreground">Dinheiro que entrou no caixa. Pagamento de OS é dividido pela composição da OS (peças × mão de obra). Estorno e devolução descontam.</p>
    </section>
  );
}
