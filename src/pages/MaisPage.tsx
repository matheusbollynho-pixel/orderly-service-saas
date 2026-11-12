// v2: área "Mais" com tudo o que não é do dia a dia, agrupado, e a busca "Onde está?".
import { useMemo, useState } from 'react';
import { ChevronRight, Lock, LogOut, Search, Smartphone } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { TELAS, semAcento, type Acesso, type TelaInicial, type View } from '@/lib/navegacao';

type Item =
  | { tipo: 'tela'; view: View; grupo: string; nome?: string; busca?: string }
  | { tipo: 'link'; rota: string; grupo: string; nome: string; busca: string; soDono?: boolean };

const GRUPOS: Item[] = [
  { tipo: 'tela', view: 'estoque', grupo: 'Peças' },
  { tipo: 'tela', view: 'cotacao', grupo: 'Peças' },
  { tipo: 'tela', view: 'reports', grupo: 'Relatórios' },
  { tipo: 'tela', view: 'pos-venda', grupo: 'Clientes' },
  { tipo: 'tela', view: 'satisfacao', grupo: 'Clientes' },
  { tipo: 'tela', view: 'mechanics', grupo: 'Equipe' },
  { tipo: 'link', rota: '/config', grupo: 'Ajustes', nome: 'Configurações da loja', busca: 'configuracao dados loja horario termos', soDono: true },
  { tipo: 'link', rota: '/config?aba=mensagens', grupo: 'Ajustes', nome: 'WhatsApp e mensagens', busca: 'whatsapp conexao qr mensagem modelo', soDono: true },
  { tipo: 'link', rota: '/config?aba=cobranca', grupo: 'Ajustes', nome: 'Cobrança online (Asaas)', busca: 'asaas pix boleto cartao link cobranca', soDono: true },
  { tipo: 'link', rota: '/config?aba=ia', grupo: 'Ajustes', nome: 'Atendente IA', busca: 'ia inteligencia artificial robo atendimento 24h', soDono: true },
  { tipo: 'link', rota: '/config?aba=ferramentas', grupo: 'Ajustes', nome: 'Reabrir OS entregue', busca: 'reabrir os desfazer entrega ferramentas', soDono: true },
  { tipo: 'link', rota: '/colaboradores', grupo: 'Ajustes', nome: 'Logins e permissões', busca: 'colaborador login acesso permissao convidar', soDono: true },
  { tipo: 'link', rota: '/minha-conta', grupo: 'Ajustes', nome: 'Assinatura SpeedSeek', busca: 'assinatura plano mensalidade pagar conta', soDono: true },
];

// Telas de outras áreas que a busca também encontra
const OUTRAS_TELAS: View[] = ['orders', 'quadro', 'agenda', 'new', 'express', 'balcao', 'encomendas', 'fluxo-caixa', 'fiados', 'boletos'];
const LOCAL: Partial<Record<View, string>> = {
  orders: 'Oficina', quadro: 'Oficina', agenda: 'Oficina', new: 'Oficina', express: 'Oficina',
  balcao: 'Balcão', encomendas: 'Balcão', 'fluxo-caixa': 'Caixa', fiados: 'Caixa', boletos: 'Caixa',
};

export default function MaisPage({ acessoDe, goTo, abrirRota, isOwner, telaInicial, setTelaInicial, onMenuAntigo, onSair }: {
  acessoDe: (v: View) => Acesso;
  goTo: (v: View) => void;
  abrirRota: (rota: string) => void;
  isOwner: boolean;
  telaInicial: TelaInicial;
  setTelaInicial: (t: TelaInicial) => void;
  onMenuAntigo: () => void;
  onSair: () => void;
}) {
  const [busca, setBusca] = useState('');

  const visiveis = useMemo(() => GRUPOS.filter((i) =>
    i.tipo === 'tela' ? acessoDe(i.view) !== 'sem_permissao' : (!i.soDono || isOwner)), [acessoDe, isOwner]);

  const resultados = useMemo(() => {
    const q = semAcento(busca.trim());
    if (!q) return null;
    const todos: { nome: string; onde: string; abrir: () => void; travado: boolean; texto: string }[] = [
      ...visiveis.map((i) => i.tipo === 'tela'
        ? { nome: TELAS[i.view].nome, onde: `Mais › ${i.grupo}`, abrir: () => goTo(i.view), travado: acessoDe(i.view) === 'plano', texto: `${TELAS[i.view].nome} ${TELAS[i.view].busca ?? ''} ${i.grupo}` }
        : { nome: i.nome, onde: `Mais › ${i.grupo}`, abrir: () => abrirRota(i.rota), travado: false, texto: `${i.nome} ${i.busca} ${i.grupo}` }),
      ...OUTRAS_TELAS.filter((v) => acessoDe(v) !== 'sem_permissao').map((v) => ({
        nome: TELAS[v].nome, onde: LOCAL[v] ?? '', abrir: () => goTo(v), travado: acessoDe(v) === 'plano',
        texto: `${TELAS[v].nome} ${TELAS[v].busca ?? ''} ${LOCAL[v] ?? ''}`,
      })),
    ];
    return todos.filter((t) => q.split(/\s+/).every((p) => semAcento(t.texto).includes(p)));
  }, [busca, visiveis, acessoDe, goTo, abrirRota]);

  const grupos = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const i of visiveis) m.set(i.grupo, [...(m.get(i.grupo) ?? []), i]);
    return [...m.entries()];
  }, [visiveis]);

  const Linha = ({ nome, onde, travado, onClick }: { nome: string; onde?: string; travado?: boolean; onClick: () => void }) => (
    <button type="button" onClick={onClick}
      className="flex min-h-[56px] w-full items-center justify-between gap-3 border-b border-border/60 px-4 text-left last:border-b-0 hover:bg-muted/40">
      <span className="min-w-0">
        <span className={cn('block text-base font-medium', travado && 'opacity-60')}>{nome}</span>
        {onde && <span className="block text-xs text-muted-foreground">{onde}</span>}
      </span>
      {travado ? <Lock className="h-4 w-4 shrink-0 text-yellow-500" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
    </button>
  );

  return (
    <div className="space-y-5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Onde está…? (ex.: boleto, comissão, WhatsApp)"
          className="h-12 pl-9 text-base" />
      </div>

      {resultados ? (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {resultados.length === 0
            ? <p className="p-4 text-sm text-muted-foreground">Nada encontrado com "{busca}".</p>
            : resultados.map((r, i) => <Linha key={i} nome={r.nome} onde={r.onde} travado={r.travado} onClick={r.abrir} />)}
        </div>
      ) : (
        <>
          {grupos.map(([grupo, itens]) => (
            <section key={grupo} className="space-y-2">
              <h3 className="px-1 text-sm font-semibold text-muted-foreground">{grupo}</h3>
              <div className="overflow-hidden rounded-xl border border-border bg-card">
                {itens.map((i) => i.tipo === 'tela'
                  ? <Linha key={i.view} nome={TELAS[i.view].nome} travado={acessoDe(i.view) === 'plano'} onClick={() => goTo(i.view)} />
                  : <Linha key={i.rota} nome={i.nome} onClick={() => abrirRota(i.rota)} />)}
              </div>
            </section>
          ))}

          <section className="space-y-2">
            <h3 className="flex items-center gap-1 px-1 text-sm font-semibold text-muted-foreground"><Smartphone className="h-4 w-4" /> Este aparelho</h3>
            <div className="space-y-3 rounded-xl border border-border bg-card p-4">
              <p className="text-sm">Ao abrir o sistema, começar em:</p>
              <div className="flex gap-1 rounded-xl bg-muted/50 p-1">
                {([['dashboard', 'Início'], ['orders', 'Ordens'], ['quadro', 'Quadro']] as [TelaInicial, string][]).map(([v, nome]) => (
                  <button key={v} type="button" onClick={() => setTelaInicial(v)}
                    className={cn('min-h-[44px] flex-1 rounded-lg text-sm font-semibold',
                      telaInicial === v ? 'bg-background shadow-sm' : 'text-muted-foreground')}>{nome}</button>
                ))}
              </div>
              <Button variant="outline" className="w-full" onClick={onMenuAntigo}>Voltar ao menu antigo</Button>
            </div>
          </section>

          <Button variant="ghost" className="w-full justify-center gap-2 text-muted-foreground" onClick={onSair}>
            <LogOut className="h-4 w-4" /> Sair
          </Button>
        </>
      )}
    </div>
  );
}
