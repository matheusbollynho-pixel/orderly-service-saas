// Relatórios › Resumo › "Pergunte ao financeiro": o dono pergunta em português e a IA responde
// só com os números que o sistema já calculou (hoje, ontem, semana, mês e os anteriores).
import { useEffect, useRef, useState } from 'react';
import { Loader2, Send, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { usePlanFeatures } from '@/hooks/usePlanFeatures';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface Fala { role: 'user' | 'assistant'; content: string; erro?: boolean }

const SUGESTOES = [
  'Quanto vendi esta semana?',
  'Qual foi o lucro das peças este mês?',
  'Como estou comparado com o mês passado?',
  'O que precisa da minha atenção agora?',
];

async function perguntar(pergunta: string, historico: Fala[]): Promise<string> {
  const { data, error } = await supabase.functions.invoke('financeiro-perguntar', {
    body: { pergunta, historico: historico.filter((f) => !f.erro).map(({ role, content }) => ({ role, content })) },
  });
  if (error) {
    let msg = 'Não consegui responder agora. Tente de novo.';
    try { const j = await (error as { context?: Response }).context?.json(); if (j?.error) msg = j.error; } catch { /* mantém */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return String(data?.resposta ?? '');
}

export function PergunteFinanceiro() {
  const { canAccess } = usePlanFeatures();
  const [aberto, setAberto] = useState(false);
  const [falas, setFalas] = useState<Fala[]>([]);
  const [texto, setTexto] = useState('');
  const [pensando, setPensando] = useState(false);
  const fim = useRef<HTMLDivElement>(null);
  const liberado = canAccess('ia-atendimento');

  useEffect(() => { fim.current?.scrollIntoView({ behavior: 'smooth' }); }, [falas, pensando]);

  const enviar = async (p: string) => {
    const pergunta = p.trim();
    if (pergunta.length < 3 || pensando) return;
    const antes = falas;
    setFalas([...antes, { role: 'user', content: pergunta }]);
    setTexto('');
    setPensando(true);
    try {
      const resposta = await perguntar(pergunta, antes);
      setFalas((f) => [...f, { role: 'assistant', content: resposta }]);
    } catch (e) {
      setFalas((f) => [...f, { role: 'assistant', content: (e as Error).message, erro: true }]);
    } finally {
      setPensando(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" className="h-10 gap-2" onClick={() => setAberto(true)}>
        <Sparkles className="h-4 w-4" /> Pergunte ao financeiro
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4" /> Pergunte ao financeiro</DialogTitle></DialogHeader>
          {!liberado ? (
            <p className="text-sm text-muted-foreground">
              A IA do financeiro é do plano Premium. Ela responde em português perguntas como "quanto vendi esta semana?"
              usando os números do seu caixa, vendas e contas.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="max-h-[55vh] min-h-[8rem] overflow-y-auto space-y-2 pr-1">
                {!falas.length && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">Responde só com os números do sistema (hoje, ontem, esta semana, semana passada, este mês e o mês passado).</p>
                    <div className="flex flex-wrap gap-2">
                      {SUGESTOES.map((s) => (
                        <button key={s} type="button" onClick={() => enviar(s)}
                          className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted">
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {falas.map((f, i) => (
                  <div key={i} className={f.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                    <div className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
                      f.role === 'user' ? 'bg-primary text-primary-foreground' : f.erro ? 'bg-red-500/10 text-red-500' : 'bg-muted text-foreground'}`}>
                      {f.content}
                    </div>
                  </div>
                ))}
                {pensando && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Calculando...</div>}
                <div ref={fim} />
              </div>
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); enviar(texto); }}>
                <input value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={500} placeholder="Ex.: quanto entrou no pix este mês?"
                  className="flex-1 h-10 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                <Button type="submit" size="icon" className="h-10 w-10" disabled={pensando || texto.trim().length < 3}>
                  <Send className="h-4 w-4" />
                </Button>
              </form>
              <p className="text-[11px] text-muted-foreground">Lucro aqui é só o das peças do estoque (venda − custo). Salários e outras despesas não entram.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
