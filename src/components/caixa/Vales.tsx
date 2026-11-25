// v2: Vale do colaborador no Caixa. Botão "Vale" abre a janela (pessoa em botões grandes,
// valor, forma, autorizado por) e o cartão "Vales em aberto" mostra quanto cada um pegou
// e ainda não foi descontado — pra conferir no acerto.
import { useMemo, useState } from 'react';
import { HandCoins, Loader2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useStore } from '@/contexts/StoreContext';
import { agruparPorPessoa, useValeAcoes, useValesAbertos, type FormaVale } from '@/hooks/useVales';
import { pedirTexto } from '@/components/v2/Confirmacao';

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const FORMAS: { f: FormaVale; nome: string }[] = [
  { f: 'dinheiro', nome: 'Dinheiro' }, { f: 'pix', nome: 'PIX' }, { f: 'fora_caixa', nome: 'Fora do caixa' },
];

export function BotaoVale() {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setAberto(true)} className="gap-2">
        <HandCoins className="h-4 w-4" />Vale
      </Button>
      {aberto && <JanelaVale onClose={() => setAberto(false)} />}
    </>
  );
}

function JanelaVale({ onClose }: { onClose: () => void }) {
  const { storeId } = useStore();
  const { lancar } = useValeAcoes();
  const [pessoa, setPessoa] = useState<{ id: string; nome: string } | null>(null);
  const [valor, setValor] = useState('');
  const [forma, setForma] = useState<FormaVale>('dinheiro');
  const [autorizado, setAutorizado] = useState('Dono');
  const [motivo, setMotivo] = useState('');

  // Pessoas da Equipe (uma por pessoa, mesmo quem é da oficina e do balcão)
  const { data: pessoas = [] } = useQuery({
    queryKey: ['pessoas-vale', storeId],
    enabled: !!storeId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('listar_pessoas_vale');
      if (error) throw error;
      return ((data ?? []) as { id: string; nome: string; cargo: string | null }[]).map((p) => ({ id: p.id, nome: p.nome, papel: p.cargo || 'Equipe' }));
    },
  });

  const num = parseFloat(valor.replace(',', '.')) || 0;
  const pode = !!pessoa && num > 0 && autorizado.trim() !== '' && !lancar.isPending;

  const salvar = async () => {
    if (!pessoa) return;
    try {
      await lancar.mutateAsync({
        colaboradorId: pessoa.id,
        valor: num, forma, autorizadoPor: autorizado.trim(), motivo: motivo.trim() || undefined,
      });
      onClose();
    } catch { /* toast já mostrado */ }
  };

  return (
    <Dialog open onOpenChange={(a) => { if (!a) onClose(); }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto max-sm:top-auto max-sm:bottom-0 max-sm:translate-y-0 max-sm:rounded-t-2xl max-sm:rounded-b-none">
        <DialogHeader>
          <DialogTitle className="text-left">Vale</DialogTitle>
          <DialogDescription className="text-left">Fica guardado no nome da pessoa pra descontar no pagamento dela.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-medium">Pra quem?</p>
            <div className="grid grid-cols-2 gap-2">
              {pessoas.map((p) => (
                <button key={p.id} type="button" onClick={() => setPessoa(p)}
                  className={cn('flex min-h-[56px] flex-col items-start justify-center rounded-xl border px-3 text-left',
                    pessoa?.id === p.id ? 'border-primary bg-primary/10' : 'border-border')}>
                  <span className="text-base font-semibold leading-tight">{p.nome}</span>
                  <span className="text-xs text-muted-foreground">{p.papel}</span>
                </button>
              ))}
              {pessoas.length === 0 && <p className="col-span-2 text-sm text-muted-foreground">Cadastre a equipe em Mais › Equipe.</p>}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Valor</p>
            <Input inputMode="decimal" placeholder="0,00" value={valor} onChange={(e) => setValor(e.target.value.replace(/[^\d.,]/g, ''))} className="h-12 text-lg" />
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Como saiu</p>
            <div className="grid grid-cols-3 gap-2">
              {FORMAS.map(({ f, nome }) => (
                <button key={f} type="button" onClick={() => setForma(f)}
                  className={cn('h-12 rounded-xl border text-sm font-semibold', forma === f ? 'border-primary bg-primary/10 text-primary' : 'border-border')}>
                  {nome}
                </button>
              ))}
            </div>
            {forma === 'fora_caixa' && <p className="mt-1 text-xs text-muted-foreground">Não mexe no Caixa (ex.: PIX da conta do dono). Só desconta no acerto.</p>}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-sm font-medium">Autorizado por</p>
              <Input value={autorizado} onChange={(e) => setAutorizado(e.target.value)} className="h-12" />
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Motivo <span className="text-muted-foreground">(opcional)</span></p>
              <Input value={motivo} maxLength={80} onChange={(e) => setMotivo(e.target.value)} className="h-12" />
            </div>
          </div>

          <Button className="h-14 w-full text-base" disabled={!pode} onClick={salvar}>
            {lancar.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : `Lançar vale${num > 0 ? ` de ${brl(num)}` : ''}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Cartão "Vales em aberto": quanto cada um pegou e ainda não foi descontado. */
export function ValesAbertos({ ocultar }: { ocultar?: boolean }) {
  const { data: vales = [], isLoading } = useValesAbertos();
  const { estornar } = useValeAcoes();
  const [aberto, setAberto] = useState<string | null>(null);
  const grupos = useMemo(() => agruparPorPessoa(vales), [vales]);
  const v = (n: number) => (ocultar ? 'R$ ••••' : brl(n));

  if (isLoading || grupos.length === 0) return null;

  const pedirEstorno = async (id: string) => {
    const motivo = await pedirTexto({ titulo: 'Estornar vale', descricao: 'O vale sai da conta da pessoa e a saída volta pro Caixa. Por quê? (fica registrado)', placeholder: 'Ex.: lançado errado', obrigatorio: true, verbo: 'Estornar' });
    if (motivo?.trim()) estornar.mutate({ id, motivo: motivo.trim() });
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vales em aberto (ainda não descontados)</p>
      <div className="divide-y divide-border/60">
        {grupos.map((g) => (
          <div key={g.chave} className="py-1">
            <button type="button" onClick={() => setAberto(aberto === g.chave ? null : g.chave)}
              className="flex min-h-[48px] w-full items-center justify-between gap-2 text-left">
              <span><b>{g.nome}</b> <span className="text-xs text-muted-foreground">· {g.vales.length} vale{g.vales.length === 1 ? '' : 's'}</span></span>
              <span className="font-semibold tabular-nums text-amber-500">{v(g.total)}</span>
            </button>
            {aberto === g.chave && (
              <div className="space-y-1 pb-2">
                {g.vales.map((x) => (
                  <div key={x.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="tabular-nums">{x.data.split('-').reverse().slice(0, 2).join('/')} · {v(Number(x.valor))} · {x.forma === 'fora_caixa' ? 'fora do caixa' : x.forma === 'pix' ? 'PIX' : 'dinheiro'}</p>
                      <p className="truncate text-xs text-muted-foreground">Autorizado por {x.autorizado_por}{x.motivo ? ` · ${x.motivo}` : ''}</p>
                    </div>
                    <Button variant="ghost" size="sm" className="h-10 shrink-0 gap-1 text-muted-foreground" disabled={estornar.isPending} onClick={() => pedirEstorno(x.id)}>
                      <Undo2 className="h-4 w-4" />Estornar
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
