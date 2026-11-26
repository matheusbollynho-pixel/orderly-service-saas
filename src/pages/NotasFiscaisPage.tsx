// Mais › Fiscal › Notas fiscais: histórico de tudo que o sistema emitiu, com PDF, XML, WhatsApp,
// consultar status e cancelar. Só aparece para loja com o módulo fiscal ligado.
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FileArchive, FilePen, FileText, FileCode, Loader2, MessageCircle, Plus, RefreshCw, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { buscarTodas } from '@/lib/buscarTodas';
import { useStore } from '@/contexts/StoreContext';
import { useStoreSettings } from '@/hooks/useStoreSettings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { confirmar, pedirTexto } from '@/components/v2/Confirmacao';
import { deIso, iso, problemaNoPeriodo, type Periodo } from '@/lib/periodo';
import { BarraPeriodo, usePeriodo } from '@/components/relatorios/BarraPeriodo';
import { baixarPlanilha } from '@/lib/planilha';
import { fmtCpf } from '@/lib/precoCliente';
import { NumerosParaInutilizar } from '@/components/fiscal/Inutilizacao';
import { AvisoCertificado } from '@/components/fiscal/AvisoCertificado';
import { NovaNfe } from '@/components/fiscal/NovaNfe';
import { VendasSemNota } from '@/components/fiscal/VendasSemNota';
import { semAcento } from '@/lib/navegacao';
import {
  NOME_MODELO, STATUS_NOTA, chamarFiscal, emAndamento, urlPdf, urlXml, type NotaFiscal, type StatusNota,
} from '@/lib/fiscal';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const TZ = '-03:00';
const brl = (v: number | null) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataHora = (s: string | null) => (s ? new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '');

type Filtro = 'todas' | 'autorizada' | 'problema' | 'cancelada';
const FILTROS: { id: Filtro; nome: string; vale: (s: StatusNota) => boolean }[] = [
  { id: 'todas', nome: 'Todas', vale: () => true },
  { id: 'autorizada', nome: 'Autorizadas', vale: (s) => s === 'autorizada' },
  { id: 'problema', nome: 'Com problema', vale: (s) => s === 'rejeitada' || s === 'denegada' || s === 'erro' || emAndamento(s) },
  { id: 'cancelada', nome: 'Canceladas', vale: (s) => s === 'cancelada' },
];

function useNotas(p: Periodo) {
  const { storeId } = useStore();
  const qc = useQueryClient();
  // Status muda sozinho (servidor atualiza): escuta a tabela
  useEffect(() => {
    if (!storeId) return;
    const canal = supabase.channel(`notas-fiscais-${storeId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notas_fiscais', filter: `store_id=eq.${storeId}` },
        () => qc.invalidateQueries({ queryKey: ['notas-fiscais'] }))
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [storeId, qc]);
  return useQuery({
    queryKey: ['notas-fiscais', storeId, p.ini, p.fim],
    enabled: !!storeId && !problemaNoPeriodo(p),
    queryFn: async () => {
      const f = deIso(p.fim); f.setDate(f.getDate() + 1);
      return buscarTodas<NotaFiscal>((a, b) => db.from('notas_fiscais').select('*')
        .eq('store_id', storeId).gte('created_at', `${p.ini}T00:00:00${TZ}`).lt('created_at', `${iso(f)}T00:00:00${TZ}`)
        .order('created_at', { ascending: false }).order('id').range(a, b));
    },
  });
}

export default function NotasFiscaisPage({ onAbrirVenda }: { onAbrirVenda?: (balcaoOrderId: string) => void }) {
  const per = usePeriodo('mes');
  const { atual } = per.escolhido;
  const { settings } = useStoreSettings();
  const qc = useQueryClient();
  const { data, isLoading } = useNotas(atual);
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [busca, setBusca] = useState('');
  const [ocupada, setOcupada] = useState<string | null>(null);
  const [nfeAberta, setNfeAberta] = useState(false);
  const [baixandoXml, setBaixandoXml] = useState(false);
  // XMLs do período (para o contador): o servidor monta um .zip com os XMLs + planilha resumo
  const baixarXmls = async () => {
    setBaixandoXml(true);
    try {
      const r = await chamarFiscal<{ nome: string; base64: string; total: number; falhas: number }>({ acao: 'xmls_periodo', de: atual.ini, ate: atual.fim });
      const bytes = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }));
      const a = document.createElement('a');
      a.href = url; a.download = r.nome; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      if (r.falhas) toast.warning(`${r.total - r.falhas} XMLs baixados; ${r.falhas} falharam (veja o LEIA-ME no arquivo).`);
      else toast.success(`${r.total} XMLs baixados.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBaixandoXml(false);
    }
  };
  const teste = (settings as { fiscal_ambiente?: string } | null)?.fiscal_ambiente !== 'producao';

  const notas = data ?? [];
  const visiveis = useMemo(() => {
    const q = semAcento(busca.trim());
    const dig = busca.replace(/\D/g, '');
    const regra = FILTROS.find((f) => f.id === filtro)!.vale;
    return notas.filter((n) => regra(n.status) && (!q || (dig && (String(n.numero ?? '').includes(dig) || (n.cpf_cnpj_cliente ?? '').includes(dig) || (n.chave ?? '').includes(dig)))
      || (!dig && semAcento(`${STATUS_NOTA[n.status]?.nome} ${NOME_MODELO[n.modelo]}`).includes(q))));
  }, [notas, filtro, busca]);

  const autorizadas = notas.filter((n) => n.status === 'autorizada');
  const totalAut = autorizadas.reduce((s, n) => s + (Number(n.valor) || 0), 0);
  const problemas = notas.filter((n) => FILTROS[2].vale(n.status));

  const acao = async (n: NotaFiscal, corpo: Record<string, unknown>, ok: string) => {
    setOcupada(n.id);
    try {
      await chamarFiscal(corpo);
      toast.success(ok);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setOcupada(null);
      qc.invalidateQueries({ queryKey: ['notas-fiscais'] });
    }
  };
  const atualizar = (n: NotaFiscal) => acao(n, { acao: 'atualizar', nota_id: n.id }, 'Status atualizado');
  const cancelar = async (n: NotaFiscal) => {
    const motivo = await pedirTexto({
      titulo: `Cancelar a nota nº ${n.numero ?? ''}?`,
      descricao: n.modelo === 'nfe' ? 'A SEFAZ aceita cancelar NF-e até 24 horas depois de autorizada. Escreva o motivo (mínimo 15 letras).' : 'A SEFAZ só aceita cancelar NFC-e até 30 minutos depois de autorizada. Escreva o motivo (mínimo 15 letras).',
      rotulo: 'Motivo do cancelamento', obrigatorio: true, multilinha: true, verbo: 'Cancelar nota',
    });
    if (!motivo) return;
    if (motivo.trim().length < 15) { toast.error('O motivo precisa ter pelo menos 15 letras.'); return; }
    if (!(await confirmar({ titulo: 'Confirmar cancelamento?', descricao: 'Isso não tem volta: a nota fica cancelada na SEFAZ.', verbo: 'Sim, cancelar', perigo: true }))) return;
    acao(n, { acao: 'cancelar', nota_id: n.id, motivo: motivo.trim() }, 'Pedido de cancelamento enviado');
  };
  // Carta de correção (só NF-e autorizada): corrige texto/observação, nunca valor, imposto, item ou cliente
  const corrigir = async (n: NotaFiscal) => {
    const texto = await pedirTexto({
      titulo: `Carta de correção da NF-e nº ${n.numero ?? ''}`,
      descricao: 'Serve para corrigir erro de texto (observação, endereço de entrega, etc.). NÃO corrige valor, imposto, produto, quantidade nem o CNPJ do cliente. Cada carta nova substitui a anterior, então escreva a correção completa.',
      rotulo: 'O que está sendo corrigido (15 a 1000 letras)', obrigatorio: true, multilinha: true, verbo: 'Enviar correção',
      valorInicial: n.cce_ultima ?? '',
    });
    if (!texto) return;
    if (texto.trim().length < 15) { toast.error('A correção precisa ter pelo menos 15 letras.'); return; }
    acao(n, { acao: 'corrigir', nota_id: n.id, texto: texto.trim() }, 'Carta de correção registrada na SEFAZ');
  };
  const whatsapp = (n: NotaFiscal) => {
    const link = urlPdf(n);
    if (!link) return;
    const texto = `${settings?.company_name ?? ''}\nSua nota fiscal nº ${n.numero ?? ''} (${brl(n.valor)}):\n${link}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank', 'noopener');
  };

  return (
    <div className="space-y-3 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold">Notas fiscais</h1>
        <Button size="sm" variant="outline" className="ml-auto h-8 gap-1.5 text-xs" onClick={() => setNfeAberta(true)}><Plus className="h-3.5 w-3.5" /> Nova NF-e</Button>
        {teste && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-600">Ambiente de teste — notas sem valor fiscal</span>}
      </div>
      <AvisoCertificado ambiente={teste ? 'sandbox' : 'producao'} />
      <NumerosParaInutilizar ambiente={teste ? 'sandbox' : 'producao'} />
      <BarraPeriodo p={per} />
      {!problemaNoPeriodo(atual) && <VendasSemNota periodo={atual} ambiente={teste ? 'sandbox' : 'producao'} onAbrirVenda={onAbrirVenda} />}
      {problemaNoPeriodo(atual) ? (
        <p className="rounded-xl border p-4 text-center text-sm text-muted-foreground">{problemaNoPeriodo(atual)}</p>
      ) : isLoading ? <Skeleton className="h-40 rounded-xl" /> : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border bg-card p-3"><p className="text-xs text-muted-foreground">Autorizadas</p><p className="text-lg font-bold text-emerald-500">{brl(totalAut)}</p><p className="text-[11px] text-muted-foreground">{autorizadas.length} {autorizadas.length === 1 ? 'nota' : 'notas'}</p></div>
            <div className="rounded-xl border bg-card p-3"><p className="text-xs text-muted-foreground">Com problema</p><p className={`text-lg font-bold ${problemas.length ? 'text-red-500' : ''}`}>{problemas.length}</p><p className="text-[11px] text-muted-foreground">rejeitadas ou pendentes</p></div>
            <div className="rounded-xl border bg-card p-3"><p className="text-xs text-muted-foreground">Canceladas</p><p className="text-lg font-bold">{notas.filter((n) => n.status === 'cancelada').length}</p><p className="text-[11px] text-muted-foreground">no período</p></div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {FILTROS.map((f) => (
              <Button key={f.id} size="sm" className="h-7 text-xs" variant={filtro === f.id ? 'default' : 'outline'} onClick={() => setFiltro(f.id)}>{f.nome}</Button>
            ))}
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nº da nota, CPF ou chave" className="h-8 w-48 text-xs" />
            <Button size="sm" variant="outline" className="ml-auto h-7 gap-1 text-xs" disabled={baixandoXml || autorizadas.length + notas.filter((n) => n.status === 'cancelada').length === 0} onClick={baixarXmls}
              title="Arquivo .zip com os XMLs autorizados e cancelados do período, para o contador">
              {baixandoXml ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileArchive className="h-3.5 w-3.5" />} XMLs do período
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={visiveis.length === 0}
              onClick={() => baixarPlanilha(`notas-fiscais-${atual.ini}-a-${atual.fim}`,
                ['Data', 'Tipo', 'Número', 'Série', 'Status', 'Valor', 'CPF/CNPJ cliente', 'Chave de acesso', 'Motivo'],
                visiveis.map((n) => [dataHora(n.created_at), NOME_MODELO[n.modelo], n.numero ?? '', n.serie ?? '', STATUS_NOTA[n.status]?.nome ?? n.status, Number(n.valor) || 0, fmtCpf(n.cpf_cnpj_cliente ?? '') || '', n.chave ?? '', n.cancel_motivo || n.motivo || '']))}>
              Baixar planilha
            </Button>
          </div>

          {visiveis.length === 0 ? (
            <p className="rounded-xl border p-4 text-center text-sm text-muted-foreground">
              {notas.length === 0 ? 'Nenhuma nota emitida no período. A nota é emitida pelo botão "Emitir nota fiscal" na venda finalizada do balcão.' : 'Nenhuma nota com esse filtro.'}
            </p>
          ) : (
            <div className="space-y-1.5">
              {visiveis.map((n) => {
                const st = STATUS_NOTA[n.status] ?? { nome: n.status, cor: '' };
                const pdf = urlPdf(n); const xml = urlXml(n);
                const vivo = ocupada === n.id;
                return (
                  <div key={n.id} className="rounded-xl border bg-card p-2.5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">
                          {NOME_MODELO[n.modelo]}{n.numero ? ` nº ${n.numero}` : ''}{n.serie ? <span className="text-xs text-muted-foreground"> · série {n.serie}</span> : null}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {dataHora(n.created_at)}{n.destinatario_nome ? ` · ${n.destinatario_nome}` : ''}{n.cpf_cnpj_cliente ? ` · ${fmtCpf(n.cpf_cnpj_cliente)}` : ' · sem CPF'}{n.origem === 'site' ? ' · venda online' : n.origem === 'manual' ? ' · avulsa' : ''}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold tabular-nums">{brl(n.valor)}</p>
                        <p className={`text-xs font-medium ${st.cor}`}>{st.nome}</p>
                      </div>
                    </div>
                    {(n.motivo || n.cancel_motivo) && (n.status !== 'autorizada' || n.motivo) && (
                      <p className={`mt-1 rounded-md px-2 py-1 text-[11px] ${n.status === 'cancelada' ? 'bg-muted text-muted-foreground' : n.status === 'autorizada' ? 'bg-amber-500/10 text-amber-600' : 'bg-red-500/10 text-red-500'}`}>
                        {n.status === 'cancelada' ? `Motivo: ${n.cancel_motivo ?? ''}` : n.motivo}
                      </p>
                    )}
                    {n.cce_ultima && <p className="mt-1 text-[11px] text-muted-foreground">Carta de correção{n.cce_protocolo ? ` (protocolo ${n.cce_protocolo})` : ''}: {n.cce_ultima}</p>}
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {n.status === 'autorizada' && pdf && (
                        <>
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => window.open(pdf, '_blank', 'noopener')}><FileText className="h-3.5 w-3.5" /> PDF</Button>
                          {xml && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => window.open(xml, '_blank', 'noopener')}><FileCode className="h-3.5 w-3.5" /> XML</Button>}
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => whatsapp(n)}><MessageCircle className="h-3.5 w-3.5" /> WhatsApp</Button>
                        </>
                      )}
                      {n.fornecedor_nota_id && n.status !== 'cancelada' && (
                        <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={vivo} onClick={() => atualizar(n)}>
                          <RefreshCw className={`h-3.5 w-3.5 ${vivo ? 'animate-spin' : ''}`} /> Consultar status
                        </Button>
                      )}
                      {n.balcao_order_id && onAbrirVenda && (
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onAbrirVenda(n.balcao_order_id!)}>Ver venda</Button>
                      )}
                      {n.status === 'autorizada' && n.modelo === 'nfe' && (
                        <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={vivo} onClick={() => corrigir(n)}>
                          <FilePen className="h-3.5 w-3.5" /> Carta de correção{n.cce_quantidade ? ` (${n.cce_quantidade})` : ''}
                        </Button>
                      )}
                      {n.status === 'autorizada' && (
                        <Button size="sm" variant="ghost" className="ml-auto h-7 text-xs text-red-500 hover:text-red-500" disabled={vivo} onClick={() => cancelar(n)}>
                          <XCircle className="h-3.5 w-3.5" /> Cancelar
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
      <NovaNfe aberto={nfeAberta} onFechar={() => setNfeAberta(false)} />
    </div>
  );
}
