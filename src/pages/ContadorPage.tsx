// Área do contador: login próprio, fora do menu da loja. Lista as lojas que liberaram o acesso,
// mostra as notas do mês (só leitura) e baixa o .zip com os XMLs. Sem acesso = "Acesso revogado".
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FileArchive, FileCode, FileText, Loader2, LogOut } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { buscarTodas } from '@/lib/buscarTodas';
import { Button } from '@/components/ui/button';
import { SIGLA_MODELO, STATUS_NOTA, chamarFiscal, urlPdf, urlXml, type NotaFiscal } from '@/lib/fiscal';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const brl = (v: number | null) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataHora = (s: string | null) => (s ? new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }) : '');
const fmtCnpj = (c: string | null) => {
  const d = (c ?? '').replace(/\D/g, '');
  return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : d;
};

interface Loja { store_id: string; nome: string; cnpj: string | null; fiscal_ativo: boolean }

/** Mês 'AAAA-MM' → primeiro e último dia ('AAAA-MM-DD'). */
export function limitesDoMes(mes: string): { de: string; ate: string } {
  const [a, m] = mes.split('-').map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return { de: `${mes}-01`, ate: `${mes}-${String(ultimo).padStart(2, '0')}` };
}
/** Mês anterior ao de hoje (horário de Brasília), no formato 'AAAA-MM'. É o que o contador fecha. */
export function mesAnterior(hoje = new Date()): string {
  const [a, m] = hoje.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).split('-').map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
}

export default function ContadorPage() {
  const { signOut, user } = useAuth();
  const { data: lojas, isLoading } = useQuery({
    queryKey: ['contador-lojas', user?.id],
    queryFn: async () => {
      const { data, error } = await db.rpc('contador_minhas_lojas');
      if (error) throw error;
      return (data ?? []) as Loja[];
    },
  });
  const [lojaId, setLojaId] = useState<string | null>(null);
  useEffect(() => {
    if (!lojaId && lojas?.length) setLojaId(lojas[0].store_id);
  }, [lojas, lojaId]);

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  if (!lojas?.length) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="text-center space-y-4">
          <p className="text-lg font-semibold text-foreground">Acesso revogado</p>
          <p className="text-sm text-muted-foreground">Sua conta não tem acesso a nenhuma loja ativa.</p>
          <button type="button" onClick={signOut} className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm">Sair</button>
        </div>
      </div>
    );
  }

  const loja = lojas.find((l) => l.store_id === lojaId) ?? lojas[0];
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-white/10 px-4 py-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Área do contador</p>
          <p className="text-sm text-foreground truncate">{user?.email}</p>
        </div>
        <Button size="sm" variant="ghost" onClick={signOut}><LogOut className="h-4 w-4" /> Sair</Button>
      </header>
      <main className="max-w-3xl mx-auto p-4 space-y-4">
        {lojas.length > 1 && (
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Empresa</label>
            <select value={loja.store_id} onChange={(e) => setLojaId(e.target.value)}
              className="w-full p-2 border border-white/20 rounded text-sm bg-black/30 text-neutral-200">
              {lojas.map((l) => <option key={l.store_id} value={l.store_id}>{l.nome}{l.cnpj ? ` — ${fmtCnpj(l.cnpj)}` : ''}</option>)}
            </select>
          </div>
        )}
        <NotasDaLoja key={loja.store_id} loja={loja} />
      </main>
    </div>
  );
}

function NotasDaLoja({ loja }: { loja: Loja }) {
  const [mes, setMes] = useState(mesAnterior());
  const { de, ate } = limitesDoMes(mes);
  const [baixando, setBaixando] = useState(false);

  const { data: notas = [], isLoading } = useQuery({
    queryKey: ['contador-notas', loja.store_id, mes],
    queryFn: async () => {
      const fim = new Date(`${ate}T00:00:00-03:00`); fim.setDate(fim.getDate() + 1);
      return buscarTodas<NotaFiscal>((a, b) => db.from('notas_fiscais').select('*')
        .eq('store_id', loja.store_id).gte('created_at', `${de}T00:00:00-03:00`).lt('created_at', fim.toISOString())
        .order('created_at', { ascending: false }).order('id').range(a, b));
    },
  });

  const resumo = useMemo(() => {
    const aut = notas.filter((n) => n.status === 'autorizada');
    const soma = (lista: NotaFiscal[]) => lista.reduce((t, n) => t + (Number(n.valor) || 0), 0);
    return {
      nfce: aut.filter((n) => n.modelo === 'nfce'), nfe: aut.filter((n) => n.modelo === 'nfe'),
      canceladas: notas.filter((n) => n.status === 'cancelada').length, soma,
    };
  }, [notas]);
  // Só autorizadas e canceladas valem para o contador (rejeitadas não existem na SEFAZ)
  const validas = notas.filter((n) => n.status === 'autorizada' || n.status === 'cancelada');

  const baixar = async () => {
    setBaixando(true);
    try {
      const r = await chamarFiscal<{ nome: string; base64: string; total: number; falhas: number }>({ acao: 'xmls_periodo', store_id: loja.store_id, de, ate });
      const bytes = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }));
      const a = document.createElement('a');
      a.href = url; a.download = `${loja.nome.replace(/[^\w-]+/g, '-')}-${r.nome}`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      if (r.falhas) toast.warning(`${r.total - r.falhas} XMLs baixados; ${r.falhas} falharam (veja o LEIA-ME no arquivo).`);
      else toast.success(`${r.total} XMLs baixados.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBaixando(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-lg font-semibold text-foreground">{loja.nome}</p>
        {loja.cnpj && <p className="text-xs text-muted-foreground">CNPJ {fmtCnpj(loja.cnpj)}</p>}
        {!loja.fiscal_ativo && <p className="text-xs text-amber-400 mt-1">A emissão de notas está desligada nesta loja no momento.</p>}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Mês</label>
          <input type="month" value={mes} onChange={(e) => e.target.value && setMes(e.target.value)}
            className="p-2 border border-white/20 rounded text-sm bg-black/30 text-neutral-200" />
        </div>
        <Button onClick={baixar} disabled={baixando || !validas.length}>
          {baixando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileArchive className="h-4 w-4" />} Baixar XMLs do mês
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Cartao titulo="NFC-e autorizadas" valor={`${resumo.nfce.length}`} sub={brl(resumo.soma(resumo.nfce))} />
        <Cartao titulo="NF-e autorizadas" valor={`${resumo.nfe.length}`} sub={brl(resumo.soma(resumo.nfe))} />
        <Cartao titulo="Canceladas" valor={`${resumo.canceladas}`} />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : !validas.length ? (
        <p className="text-sm text-muted-foreground text-center py-8">Nenhuma nota autorizada ou cancelada neste mês.</p>
      ) : (
        <div className="space-y-1.5">
          {validas.map((n) => {
            const st = STATUS_NOTA[n.status];
            const pdf = urlPdf(n), xml = urlXml(n);
            return (
              <div key={n.id} className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground">
                    {SIGLA_MODELO[n.modelo]} nº {n.numero ?? '—'}{n.serie ? ` · série ${n.serie}` : ''} · <span className="font-semibold">{brl(n.valor)}</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {dataHora(n.autorizada_em ?? n.created_at)} · <span className={st?.cor}>{st?.nome ?? n.status}</span>
                  </p>
                </div>
                {pdf && <a href={pdf} target="_blank" rel="noopener noreferrer" title="PDF" className="p-1.5 text-muted-foreground hover:text-foreground"><FileText className="h-4 w-4" /></a>}
                {xml && <a href={xml} target="_blank" rel="noopener noreferrer" title="XML" className="p-1.5 text-muted-foreground hover:text-foreground"><FileCode className="h-4 w-4" /></a>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Cartao({ titulo, valor, sub }: { titulo: string; valor: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-white/10 p-3">
      <p className="text-[11px] text-muted-foreground">{titulo}</p>
      <p className="text-xl font-bold text-foreground">{valor}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}
