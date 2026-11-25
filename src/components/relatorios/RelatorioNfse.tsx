// Relatórios > Notas de serviço: OS entregues no período com o valor só da mão de obra, para lançar
// a NFS-e na prefeitura (fora do app). Cada OS pode ser marcada como "NFS-e emitida" com o número.
// Mão de obra = itens marcados como serviço; desconto da OS é rateado pelo peso do serviço no total.
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { buscarTodas } from '@/lib/buscarTodas';
import { useStore } from '@/contexts/StoreContext';
import { useAuth } from '@/hooks/useAuth';
import { useColaboradorLogado } from '@/hooks/useColaboradorLogado';
import { useStoreSettings } from '@/hooks/useStoreSettings';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { pedirTexto, confirmar } from '@/components/v2/Confirmacao';
import { baixarPlanilha } from '@/lib/planilha';
import { deIso, iso, problemaNoPeriodo, type Periodo } from '@/lib/periodo';
import { BarraPeriodo, usePeriodo } from './BarraPeriodo';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const TZ = '-03:00';
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const num = (v: unknown) => Number(v) || 0;
const qtdTexto = (t: string | null) => { const m = String(t ?? '').trim().match(/^-?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)/); return m ? Number(m[0]) : 0; };
const fmtDoc = (v: string | null | undefined) => {
  const d = String(v ?? '').replace(/\D/g, '');
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return '';
};

interface OS {
  id: string; exit_date: string; client_name: string; client_cpf: string | null; equipment: string | null;
  nfse_numero: string | null; nfse_emitida_em: string | null; nfse_por: string | null;
  materials: { descricao: string; quantidade: string | null; valor: number | null; is_service: boolean | null }[];
  payments: { discount_amount: number | null }[];
}

function useOsServicos(p: Periodo) {
  const { storeId } = useStore();
  return useQuery({
    queryKey: ['relatorio-nfse', storeId, p.ini, p.fim],
    enabled: !!storeId && !problemaNoPeriodo(p),
    queryFn: async () => {
      const de = `${p.ini}T00:00:00${TZ}`;
      const f = deIso(p.fim); f.setDate(f.getDate() + 1);
      const ate = `${iso(f)}T00:00:00${TZ}`;
      return buscarTodas<OS>((a, b) => db.from('service_orders')
        .select('id, exit_date, client_name, client_cpf, equipment, nfse_numero, nfse_emitida_em, nfse_por, materials(descricao, quantidade, valor, is_service), payments(discount_amount)')
        .eq('store_id', storeId).eq('status', 'concluida_entregue').neq('equipment', '__QR_WALKIN_PLACEHOLDER__')
        .gte('exit_date', de).lt('exit_date', ate)
        .order('exit_date', { ascending: false }).order('id').range(a, b));
    },
  });
}

export default function RelatorioNfse({ onOpenOrder }: { onOpenOrder?: (id: string) => void }) {
  const per = usePeriodo('mes');
  const { atual } = per.escolhido;
  const qc = useQueryClient();
  const { user } = useAuth();
  const eu = useColaboradorLogado();
  const { settings } = useStoreSettings();
  const { data, isLoading } = useOsServicos(atual);
  const [filtro, setFiltro] = useState<'falta' | 'emitidas' | 'todas'>('falta');

  const cnpj = (settings as { servicos_cnpj?: string | null } | null)?.servicos_cnpj || settings?.store_cnpj || '';
  const razao = (settings as { servicos_razao_social?: string | null } | null)?.servicos_razao_social || settings?.store_owner || settings?.company_name || '';

  const linhas = useMemo(() => (data ?? []).map((o) => {
    const itens = o.materials ?? [];
    const total = itens.reduce((s, m) => s + num(m.valor) * qtdTexto(m.quantidade), 0);
    const servicos = itens.filter((m) => m.is_service);
    const bruto = servicos.reduce((s, m) => s + num(m.valor) * qtdTexto(m.quantidade), 0);
    const desc = (o.payments ?? []).reduce((s, p) => s + num(p.discount_amount), 0);
    // Desconto da OS dividido entre peças e serviço pelo peso de cada um
    const descServ = total > 0 ? Math.round(desc * (bruto / total) * 100) / 100 : 0;
    return { ...o, bruto, descServ, valor: Math.max(bruto - descServ, 0), descricao: servicos.map((m) => m.descricao).filter(Boolean).join('; ') };
  }).filter((o) => o.bruto > 0), [data]);

  const visiveis = linhas.filter((o) => filtro === 'todas' || (filtro === 'falta' ? !o.nfse_numero : !!o.nfse_numero));
  const tot = (xs: typeof linhas) => xs.reduce((s, o) => s + o.valor, 0);
  const falta = linhas.filter((o) => !o.nfse_numero);

  const marcar = async (o: (typeof linhas)[number]) => {
    const n = await pedirTexto({ titulo: 'NFS-e emitida', descricao: `${o.client_name} · ${brl(o.valor)} de serviço. Número da nota de serviço da prefeitura:`, rotulo: 'Número da NFS-e', obrigatorio: true, verbo: 'Marcar como emitida' });
    if (!n) return;
    const { error } = await db.from('service_orders').update({ nfse_numero: n.trim(), nfse_emitida_em: new Date().toISOString(), nfse_por: eu?.nome || user?.email || null }).eq('id', o.id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ['relatorio-nfse'] });
    toast.success('Marcada como emitida');
  };
  const desfazer = async (o: (typeof linhas)[number]) => {
    if (!(await confirmar({ titulo: `Desmarcar a NFS-e ${o.nfse_numero}?`, descricao: 'A OS volta para "falta emitir".', verbo: 'Desmarcar' }))) return;
    const { error } = await db.from('service_orders').update({ nfse_numero: null, nfse_emitida_em: null, nfse_por: null }).eq('id', o.id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ['relatorio-nfse'] });
  };

  return (
    <div className="space-y-3">
      <BarraPeriodo p={per} />
      <p className="text-xs text-muted-foreground">
        OS entregues no período com <b>mão de obra</b> (itens marcados como serviço), para lançar a nota de serviço na prefeitura.
        Emitente: <b>{razao || 'nome da loja'}</b>{cnpj ? ` · CNPJ ${fmtDoc(cnpj) || cnpj}` : ''}
        {(settings as { servicos_cnpj?: string | null } | null)?.servicos_cnpj ? ' (CNPJ de serviços)' : ''}. Peças ficam para a nota de venda.
      </p>
      {problemaNoPeriodo(atual) ? (
        <p className="rounded-xl border p-4 text-center text-sm text-muted-foreground">{problemaNoPeriodo(atual)}</p>
      ) : isLoading ? <Skeleton className="h-40 rounded-xl" /> : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border bg-card p-3"><p className="text-xs text-muted-foreground">Serviços no período</p><p className="text-lg font-bold">{brl(tot(linhas))}</p><p className="text-[11px] text-muted-foreground">{linhas.length} OS</p></div>
            <div className="rounded-xl border bg-card p-3"><p className="text-xs text-muted-foreground">Falta emitir</p><p className="text-lg font-bold text-amber-500">{brl(tot(falta))}</p><p className="text-[11px] text-muted-foreground">{falta.length} OS</p></div>
            <div className="rounded-xl border bg-card p-3"><p className="text-xs text-muted-foreground">Já emitidas</p><p className="text-lg font-bold text-emerald-500">{brl(tot(linhas) - tot(falta))}</p><p className="text-[11px] text-muted-foreground">{linhas.length - falta.length} OS</p></div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {(['falta', 'emitidas', 'todas'] as const).map((f) => (
              <Button key={f} size="sm" className="h-7 text-xs" variant={filtro === f ? 'default' : 'outline'} onClick={() => setFiltro(f)}>
                {f === 'falta' ? 'Falta emitir' : f === 'emitidas' ? 'Emitidas' : 'Todas'}
              </Button>
            ))}
            <Button size="sm" variant="outline" className="ml-auto h-7 text-xs" disabled={visiveis.length === 0}
              onClick={() => baixarPlanilha(`notas-de-servico-${atual.ini}-a-${atual.fim}`,
                ['Data', 'Cliente', 'CPF/CNPJ', 'Veículo', 'Serviços', 'Valor bruto', 'Desconto', 'Valor da nota', 'NFS-e'],
                visiveis.map((o) => [new Date(o.exit_date).toLocaleDateString('pt-BR'), o.client_name, fmtDoc(o.client_cpf), o.equipment ?? '', o.descricao, o.bruto, o.descServ, o.valor, o.nfse_numero ?? '']))}>
              Baixar planilha
            </Button>
          </div>
          {visiveis.length === 0 ? (
            <p className="rounded-xl border p-4 text-center text-sm text-muted-foreground">{filtro === 'falta' ? 'Nenhuma nota de serviço faltando no período.' : 'Nada no período.'}</p>
          ) : (
            <div className="space-y-1.5">
              {visiveis.map((o) => (
                <div key={o.id} className="rounded-xl border bg-card p-2.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 cursor-pointer" onClick={onOpenOrder ? () => onOpenOrder(o.id) : undefined}>
                      <p className="text-sm font-medium">{o.client_name}{fmtDoc(o.client_cpf) ? <span className="text-xs text-muted-foreground"> · {fmtDoc(o.client_cpf)}</span> : null}</p>
                      <p className="text-[11px] text-muted-foreground">{new Date(o.exit_date).toLocaleDateString('pt-BR')} · {o.equipment}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{o.descricao}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold tabular-nums">{brl(o.valor)}</p>
                      {o.descServ > 0 && <p className="text-[10px] text-muted-foreground">({brl(o.bruto)} − desconto {brl(o.descServ)})</p>}
                    </div>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    {o.nfse_numero ? (
                      <>
                        <span className="text-xs font-medium text-emerald-500">NFS-e nº {o.nfse_numero} · {o.nfse_emitida_em ? new Date(o.nfse_emitida_em).toLocaleDateString('pt-BR') : ''}{o.nfse_por ? ` · ${o.nfse_por}` : ''}</span>
                        <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={() => desfazer(o)}>Desmarcar</Button>
                      </>
                    ) : (
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => marcar(o)}>Marcar NFS-e emitida</Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
