// Bloco "Nota fiscal" dentro da venda do balcão ou da OS (só as peças): emitir NFC-e/NF-e, ver status, PDF/WhatsApp, tentar de novo.
// Não aparece se o módulo fiscal da loja estiver desligado.
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FileText, Loader2, MessageCircle, ReceiptText, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useStoreSettings } from '@/hooks/useStoreSettings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fmtCpf } from '@/lib/precoCliente';
import { SIGLA_MODELO, STATUS_NOTA, chamarFiscal, emAndamento, urlPdf, type NotaFiscal } from '@/lib/fiscal';
import { NovaNfe } from './NovaNfe';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const brl = (v: number | null) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Nota fiscal mais recente da venda (a "viva" vem antes). */
export function useNotaDaVenda(balcaoOrderId: string, ativo: boolean, coluna: 'balcao_order_id' | 'order_id' = 'balcao_order_id') {
  const qc = useQueryClient();
  useEffect(() => {
    if (!ativo) return;
    const canal = supabase.channel(`nota-venda-${balcaoOrderId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notas_fiscais', filter: `${coluna}=eq.${balcaoOrderId}` },
        () => qc.invalidateQueries({ queryKey: ['nota-venda', balcaoOrderId] }))
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [balcaoOrderId, ativo, qc, coluna]);
  return useQuery({
    queryKey: ['nota-venda', balcaoOrderId],
    enabled: ativo,
    queryFn: async () => {
      const { data, error } = await db.from('notas_fiscais').select('*').eq(coluna, balcaoOrderId)
        .order('created_at', { ascending: false }).limit(5);
      if (error) throw error;
      const lista = (data ?? []) as NotaFiscal[];
      return lista.find((n) => n.status !== 'cancelada') ?? lista[0] ?? null;
    },
  });
}

export function NotaFiscalVenda({ balcaoOrderId, orderId, clientCpf, clientPhone, clientId, clientNome }: {
  /** Venda do balcão... */
  balcaoOrderId?: string;
  /** ...ou OS (a nota leva só as peças) */
  orderId?: string;
  clientCpf?: string | null; clientPhone?: string | null; clientId?: string | null; clientNome?: string | null;
}) {
  const ehOs = !balcaoOrderId && !!orderId;
  const idRef = (balcaoOrderId ?? orderId)!;
  const refCorpo = ehOs ? { order_id: idRef } : { balcao_order_id: idRef };
  const [nfeAberta, setNfeAberta] = useState(false);
  const { settings } = useStoreSettings();
  const ativo = !!(settings as { fiscal_ativo?: boolean } | null)?.fiscal_ativo;
  const teste = (settings as { fiscal_ambiente?: string } | null)?.fiscal_ambiente !== 'producao';
  const qc = useQueryClient();
  const { data: nota, isLoading } = useNotaDaVenda(idRef, ativo, ehOs ? 'order_id' : 'balcao_order_id');
  const [cpf, setCpf] = useState(clientCpf ?? '');
  const [enviando, setEnviando] = useState(false);
  useEffect(() => { setCpf(clientCpf ?? ''); }, [clientCpf]);

  if (!ativo) return null;

  const recarregar = () => {
    qc.invalidateQueries({ queryKey: ['nota-venda', idRef] });
    qc.invalidateQueries({ queryKey: ['notas-fiscais'] });
  };
  const emitir = async () => {
    const d = cpf.replace(/\D/g, '');
    if (d && d.length !== 11 && d.length !== 14) { toast.error('CPF/CNPJ incompleto. Corrija ou deixe em branco.'); return; }
    setEnviando(true);
    try {
      const r = await chamarFiscal<{ status: string; motivo?: string | null }>({ acao: 'emitir_nfce', ...refCorpo, cpf: d || null });
      if (r.status === 'autorizada') toast.success('Nota fiscal autorizada!');
      else if (r.status === 'rejeitada') toast.error(`Nota rejeitada: ${r.motivo ?? 'veja o motivo abaixo'}`);
      else toast.success('Nota enviada. Aguardando a SEFAZ...');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setEnviando(false);
      recarregar();
    }
  };
  const consultar = async () => {
    if (!nota) return;
    setEnviando(true);
    try { await chamarFiscal({ acao: 'atualizar', nota_id: nota.id }); } catch (e) { toast.error((e as Error).message); }
    finally { setEnviando(false); recarregar(); }
  };
  const whatsapp = () => {
    const link = nota ? urlPdf(nota) : null;
    if (!link || !nota) return;
    const fone = String(clientPhone ?? '').replace(/\D/g, '');
    const texto = `${settings?.company_name ?? ''}\nSua nota fiscal nº ${nota.numero ?? ''} (${brl(nota.valor)}):\n${link}`;
    const destino = fone ? (fone.length <= 11 ? `55${fone}` : fone) : '';
    window.open(`https://wa.me/${destino}?text=${encodeURIComponent(texto)}`, '_blank', 'noopener');
  };

  const podeEmitir = !nota || ['rejeitada', 'erro', 'cancelada', 'denegada', 'inutilizada'].includes(nota.status);
  const st = nota ? STATUS_NOTA[nota.status] ?? { nome: nota.status, cor: '' } : null;
  const pdf = nota ? urlPdf(nota) : null;

  return (
    <div className="rounded-lg border border-border bg-muted/20 px-3 py-2.5 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Nota fiscal{ehOs ? ' das peças' : ''}</p>
          {ehOs && <p className="text-[11px] text-muted-foreground">Só as peças. A mão de obra vai na nota de serviço (NFS-e).</p>}
        </div>
        {teste && <span className="text-[10px] font-medium text-amber-600">teste · sem valor fiscal</span>}
      </div>
      {isLoading ? <p className="text-xs text-muted-foreground">Carregando…</p> : (
        <>
          {nota && st && (
            <div className="text-sm">
              <span className={`font-semibold ${st.cor}`}>{st.nome}</span>
              {nota.numero ? <span className="text-muted-foreground"> · {SIGLA_MODELO[nota.modelo]} nº {nota.numero}</span> : nota.modelo === 'nfe' ? <span className="text-muted-foreground"> · NF-e</span> : null}
              {nota.cpf_cnpj_cliente ? <span className="text-muted-foreground"> · {fmtCpf(nota.cpf_cnpj_cliente)}</span> : null}
              {(nota.status !== 'autorizada' || nota.motivo) && (nota.motivo || nota.cancel_motivo) && (
                <p className={`mt-1 rounded-md px-2 py-1 text-[11px] ${nota.status === 'cancelada' ? 'bg-muted text-muted-foreground' : nota.status === 'autorizada' ? 'bg-amber-500/10 text-amber-600' : 'bg-red-500/10 text-red-500'}`}>
                  {nota.status === 'cancelada' ? `Cancelada: ${nota.cancel_motivo ?? ''}` : nota.motivo}
                </p>
              )}
            </div>
          )}
          {nota?.status === 'autorizada' && pdf && (
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1 h-9 gap-1.5 text-sm" onClick={() => window.open(pdf, '_blank', 'noopener')}>
                <FileText className="h-4 w-4" /> Ver / imprimir
              </Button>
              <Button type="button" variant="outline" onClick={whatsapp}
                className="flex-1 h-9 gap-1.5 text-sm text-green-600 border-green-300 hover:bg-green-50 dark:text-green-400 dark:border-green-700 dark:hover:bg-green-950/30">
                <MessageCircle className="h-4 w-4" /> WhatsApp
              </Button>
            </div>
          )}
          {nota && emAndamento(nota.status) && (
            <Button type="button" variant="outline" className="w-full h-9 gap-1.5 text-sm" disabled={enviando} onClick={consultar}>
              <RefreshCw className={`h-4 w-4 ${enviando ? 'animate-spin' : ''}`} /> Consultar na SEFAZ
            </Button>
          )}
          {podeEmitir && (
            <div className="space-y-1.5">
              <Input value={cpf} onChange={(e) => setCpf(e.target.value)} placeholder="CPF/CNPJ na nota (opcional)" className="h-9 text-sm" inputMode="numeric" />
              <Button type="button" className="w-full h-9 gap-1.5 text-sm" disabled={enviando} onClick={emitir}>
                {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ReceiptText className="h-4 w-4" />}
                {nota && nota.modelo === 'nfce' && !['cancelada', 'inutilizada'].includes(nota.status) ? 'Corrigir e enviar de novo' : 'Emitir nota fiscal (NFC-e)'}
              </Button>
              <Button type="button" variant="outline" className="w-full h-9 gap-1.5 text-sm" disabled={enviando} onClick={() => setNfeAberta(true)}>
                {nota?.modelo === 'nfe' && !['cancelada', 'inutilizada'].includes(nota.status) ? 'Corrigir e enviar a NF-e de novo' : 'Emitir NF-e (cliente com CNPJ)'}
              </Button>
            </div>
          )}
        </>
      )}
      <NovaNfe aberto={nfeAberta} onFechar={() => setNfeAberta(false)} balcaoOrderId={balcaoOrderId} orderId={ehOs ? orderId : undefined}
        clientId={clientId} clientNome={clientNome} clientDoc={clientCpf} />
    </div>
  );
}
