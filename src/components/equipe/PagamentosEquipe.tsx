// Pagamentos da equipe (substitui o Acerto de comissão): tabela de quem recebe quando e quanto.
// Total = fixo + comissão - vales + saldo anterior. Contas e gravação no banco
// (folha_equipe / previa_pagamento / fechar_pagamento / desfazer_pagamento).
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Undo2, Wallet } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useStore } from '@/contexts/StoreContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { pedirTexto } from '@/components/v2/Confirmacao';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const brl = (v: number) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBR = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
const FORMA: Record<string, string> = { comissao: 'Só comissão', fixo_comissao: 'Fixo + comissão', fixo: 'Só fixo' };
const PERIODO: Record<string, string> = { semanal: 'semanal', quinzenal: 'quinzenal', mensal: 'mensal' };

interface Linha {
  id: string; nome: string; cargo: string | null; ativo: boolean;
  forma: string; periodicidade: string; ini: string; fim: string;
  situacao: 'atrasado' | 'hoje' | 'em_dia';
  valor_fixo: number; comissao: number; vales: number; qtd_vales: number; saldo_anterior: number; total: number;
  ultimo: { id: string; ini: string; fim: string; total: number; pago: number; pago_em: string } | null;
}
interface Pago {
  id: string; colaborador_id: string | null; pessoa_nome: string; ini: string; fim: string;
  valor_fixo: number; comissao: number; vales: number; saldo_anterior: number; total: number; pago: number;
  meio: string; pago_em: string;
}

export default function PagamentosEquipe() {
  const { storeId, permissions } = useStore();
  const podePagar = permissions.pagar_equipe !== false;
  const qc = useQueryClient();
  const [pagando, setPagando] = useState<Linha | null>(null);

  const folha = useQuery({
    queryKey: ['folha-equipe', storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await db.rpc('folha_equipe', { p_store_id: storeId });
      if (error) throw error;
      return (data ?? []) as Linha[];
    },
  });
  const historico = useQuery({
    queryKey: ['folha-equipe', 'historico', storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await db.from('pagamentos_equipe').select('*').eq('store_id', storeId).is('desfeito_em', null)
        .order('pago_em', { ascending: false }).limit(30);
      if (error) throw error;
      return (data ?? []) as Pago[];
    },
  });

  const ordem = { atrasado: 0, hoje: 1, em_dia: 2 } as const;
  const linhas = useMemo(() => [...(folha.data ?? [])].sort((a, b) =>
    ordem[a.situacao] - ordem[b.situacao] || a.fim.localeCompare(b.fim) || a.nome.localeCompare(b.nome, 'pt-BR')), [folha.data]);
  const aPagarAgora = linhas.filter((l) => l.situacao !== 'em_dia').reduce((s, l) => s + Math.max(0, l.total), 0);

  const desfazer = async (p: Pago) => {
    const motivo = await pedirTexto({ titulo: `Desfazer pagamento de ${p.pessoa_nome}?`, descricao: 'A saída do caixa é estornada e os vales e serviços voltam a ficar em aberto. Por quê?', obrigatorio: true, verbo: 'Desfazer' });
    if (!motivo) return;
    const { error } = await db.rpc('desfazer_pagamento', { p_id: p.id, p_motivo: motivo });
    if (error) { toast.error(error.message); return; }
    for (const k of ['folha-equipe', 'vales', 'cash-flow', 'cash-flow-summary', 'cash-flow-period']) qc.invalidateQueries({ queryKey: [k] });
    toast.success('Pagamento desfeito.');
  };

  if (folha.error) return <p className="text-sm text-red-500 py-6 text-center">{(folha.error as Error).message}</p>;

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Pagar equipe</h2>
          <p className="text-xs text-muted-foreground">Fixo + comissão − vales. Como cada um recebe se ajusta na ficha (Mais › Equipe).</p>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-3">
        <p className="text-xs text-muted-foreground">A pagar hoje e atrasados</p>
        <p className="text-xl font-bold">{brl(aPagarAgora)}</p>
      </div>

      {folha.isLoading ? (
        <p className="text-sm text-muted-foreground py-6 text-center">Carregando...</p>
      ) : linhas.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">Ninguém na equipe ainda. Cadastre em Mais › Equipe.</p>
      ) : (
        <div className="space-y-2">
          {linhas.map((l) => (
            <div key={l.id} className={cn('rounded-xl border bg-card p-3 space-y-2', l.situacao === 'atrasado' && 'border-red-500/60')}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium truncate">{l.nome}{!l.ativo && <span className="text-xs text-muted-foreground"> · inativo</span>}</p>
                  <p className="text-[11px] text-muted-foreground">{[l.cargo, FORMA[l.forma], PERIODO[l.periodicidade]].filter(Boolean).join(' · ')}</p>
                </div>
                <span className={cn('text-[11px] rounded px-1.5 py-0.5 border flex-shrink-0',
                  l.situacao === 'atrasado' ? 'border-red-500 text-red-500' : l.situacao === 'hoje' ? 'border-amber-500 text-amber-500' : 'text-muted-foreground')}>
                  {l.situacao === 'atrasado' ? `Atrasado (${dataBR(l.fim)})` : l.situacao === 'hoje' ? 'Paga hoje' : `Paga ${dataBR(l.fim)}`}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">Período {dataBR(l.ini)} a {dataBR(l.fim)}</p>
              <Contas l={l} />
              {podePagar && (
                <Button size="sm" className="w-full" variant={l.situacao === 'em_dia' ? 'outline' : 'default'} onClick={() => setPagando(l)}>
                  <Wallet className="h-4 w-4 mr-1" /> Pagar
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl border bg-card p-3 space-y-1.5">
        <p className="text-sm font-semibold">Últimos pagamentos</p>
        {(historico.data ?? []).length === 0 && <p className="text-xs text-muted-foreground">Nenhum pagamento ainda.</p>}
        {(historico.data ?? []).map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-2 text-sm border-b last:border-0 py-1.5">
            <div className="min-w-0">
              <p className="truncate">{p.pessoa_nome} <span className="text-xs text-muted-foreground">· {dataBR(p.ini)} a {dataBR(p.fim)}</span></p>
              <p className="text-[11px] text-muted-foreground">
                {new Date(p.pago_em).toLocaleDateString('pt-BR')} · {p.meio === 'fora_caixa' ? 'fora do caixa' : p.meio}
                {p.total < 0 ? ` · ficou ${brl(-p.total)} de vale para o próximo` : ''}
              </p>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <span className="font-medium">{brl(p.pago)}</span>
              {podePagar && (
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => desfazer(p)}>
                  <Undo2 className="h-3.5 w-3.5 mr-1" /> Desfazer
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {pagando && <JanelaPagar linha={pagando} onClose={() => setPagando(null)} />}
    </div>
  );
}

function Contas({ l }: { l: Pick<Linha, 'valor_fixo' | 'comissao' | 'vales' | 'qtd_vales' | 'saldo_anterior' | 'total' | 'forma'> }) {
  return (
    <div className="text-sm space-y-0.5">
      {l.forma !== 'comissao' && <LinhaConta nome="Fixo" valor={brl(l.valor_fixo)} />}
      {l.forma !== 'fixo' && <LinhaConta nome="Comissão" valor={brl(l.comissao)} />}
      {l.vales > 0 && <LinhaConta nome={`Vales (${l.qtd_vales})`} valor={`− ${brl(l.vales)}`} cor="text-red-500" />}
      {l.saldo_anterior !== 0 && <LinhaConta nome="Saldo anterior" valor={brl(l.saldo_anterior)} cor="text-red-500" />}
      <div className="flex justify-between border-t pt-1 font-semibold">
        <span>{l.total < 0 ? 'Fica devendo' : 'Total a pagar'}</span>
        <span className={l.total < 0 ? 'text-red-500' : ''}>{brl(Math.abs(l.total))}</span>
      </div>
    </div>
  );
}

function LinhaConta({ nome, valor, cor }: { nome: string; valor: string; cor?: string }) {
  return <div className="flex justify-between"><span className="text-muted-foreground">{nome}</span><span className={cor}>{valor}</span></div>;
}

function JanelaPagar({ linha, onClose }: { linha: Linha; onClose: () => void }) {
  const qc = useQueryClient();
  const [ini, setIni] = useState(linha.ini);
  const [fim, setFim] = useState(linha.fim);
  const [meio, setMeio] = useState<'dinheiro' | 'pix' | 'fora_caixa'>('pix');
  const [salvando, setSalvando] = useState(false);
  const [previa, setPrevia] = useState<Pick<Linha, 'valor_fixo' | 'comissao' | 'vales' | 'qtd_vales' | 'saldo_anterior' | 'total'> | null>(linha);
  const [erroPrevia, setErroPrevia] = useState<string | null>(null);

  // Mudou o período: recalcula no banco
  useEffect(() => {
    if (ini === linha.ini && fim === linha.fim) { setPrevia(linha); setErroPrevia(null); return; }
    let vivo = true;
    setPrevia(null);
    db.rpc('previa_pagamento', { p_colaborador_id: linha.id, p_ini: ini, p_fim: fim }).then(({ data, error }: { data: unknown; error: { message: string } | null }) => {
      if (!vivo) return;
      if (error) { setErroPrevia(error.message); return; }
      setErroPrevia(null);
      setPrevia(data as typeof previa);
    });
    return () => { vivo = false; };
  }, [ini, fim, linha]);

  const pagar = async () => {
    setSalvando(true);
    const { error } = await db.rpc('fechar_pagamento', { p_colaborador_id: linha.id, p_ini: ini, p_fim: fim, p_meio: meio });
    setSalvando(false);
    if (error) { toast.error(error.message); return; }
    for (const k of ['folha-equipe', 'vales', 'cash-flow', 'cash-flow-summary', 'cash-flow-period', 'relatorio-resumo']) qc.invalidateQueries({ queryKey: [k] });
    toast.success(`Pagamento de ${linha.nome} registrado.`);
    onClose();
  };

  const total = previa?.total ?? 0;
  return (
    <Dialog open onOpenChange={(a) => { if (!a) onClose(); }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto max-sm:top-auto max-sm:bottom-0 max-sm:translate-y-0 max-sm:rounded-t-2xl max-sm:rounded-b-none">
        <DialogHeader>
          <DialogTitle className="text-left">Pagar {linha.nome}</DialogTitle>
          <DialogDescription className="text-left">Confira o período. A comissão contada fica marcada como paga e os vales saem da conta dele.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <div><p className="text-xs text-muted-foreground mb-1">De</p><Input type="date" value={ini} onChange={(e) => setIni(e.target.value)} /></div>
            <div><p className="text-xs text-muted-foreground mb-1">Até</p><Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} /></div>
          </div>
          <div className="rounded-lg border p-3">
            {erroPrevia ? <p className="text-sm text-red-500">{erroPrevia}</p>
              : previa ? <Contas l={{ ...previa, forma: linha.forma }} />
              : <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Calculando...</p>}
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">Como pagou</p>
            <div className="grid grid-cols-3 gap-2">
              {([['pix', 'Pix'], ['dinheiro', 'Dinheiro'], ['fora_caixa', 'Fora do caixa']] as const).map(([v, n]) => (
                <button key={v} type="button" onClick={() => setMeio(v)}
                  className={cn('h-11 rounded-xl border text-sm font-semibold', meio === v ? 'border-primary bg-primary/10 text-primary' : 'border-border')}>{n}</button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">{meio === 'fora_caixa' ? 'Não lança nada no caixa.' : 'Lança a saída no caixa de hoje (categoria Salário).'}</p>
          </div>
          {total < 0 && <p className="text-xs text-amber-500">Os vales passam do que ele tem a receber: não sai dinheiro e fica {brl(-total)} para descontar no próximo pagamento.</p>}
          <Button className="w-full h-12" disabled={salvando || !previa || !!erroPrevia} onClick={pagar}>
            {salvando ? 'Registrando...' : total > 0 ? `Pagar ${brl(total)}` : 'Fechar o período'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
