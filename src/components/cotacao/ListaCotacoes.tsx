import { Check } from 'lucide-react';
import { brl, diasAtras, ordenarOpcoes, type CotacaoPreco, type useCotacao } from '@/hooks/useCotacao';
import { cn } from '@/lib/utils';

type Cot = ReturnType<typeof useCotacao>;

const ROTULO: Record<CotacaoPreco['situacao'], { txt: string; cls: string }> = {
  cotado: { txt: '✅ Tem', cls: 'text-green-600' },
  duvida: { txt: '❓ Conferir', cls: 'text-yellow-600' },
  nao_tem: { txt: '❌ Não tem', cls: 'text-muted-foreground' },
  nao_serve: { txt: '⚠️ Não serve', cls: 'text-red-600' },
};

/**
 * Todas as respostas dos representantes pra UMA peça, juntas: quem tem, marca,
 * valor (só com o olhinho), prazo e observação; e quem ainda não respondeu.
 * Se `onEscolher` vier, as opções com preço viram botões pra escolher.
 */
export function ListaCotacoes({ itemId, cot, verPreco, escolhidoId, onEscolher }: {
  itemId: string;
  cot: Cot;
  verPreco: boolean;
  escolhidoId?: string | null;
  onEscolher?: (p: CotacaoPreco) => void;
}) {
  const precos = ordenarOpcoes(cot.precos.filter((p) => p.item_id === itemId));
  const prazoDe = (p: CotacaoPreco) => cot.respostas.find((r) => r.id === p.resposta_id)?.prazo_entrega ?? null;
  const nomeDe = (p: CotacaoPreco) =>
    p.fonte === 'internet' ? `Internet${p.loja_internet ? ` · ${p.loja_internet}` : ''}` : cot.representantes.find((r) => r.id === p.representante_id)?.nome ?? 'Representante';

  // Representantes que receberam link com essa peça e ainda não responderam nada dela
  const responderam = new Set(precos.map((p) => p.representante_id));
  const aguardando = cot.links
    .filter((l) => l.itens.includes(itemId) && !responderam.has(l.representante_id))
    .map((l) => l.representante_id)
    .filter((id, i, arr) => arr.indexOf(id) === i);

  if (precos.length === 0 && aguardando.length === 0) {
    return <p className="text-xs text-muted-foreground">Ninguém foi consultado ainda. Use "Pedir preço agora".</p>;
  }

  return (
    <div className="space-y-1">
      {precos.map((p) => {
        const r = ROTULO[p.situacao];
        const escolhido = escolhidoId === p.id;
        const clicavel = !!onEscolher && p.situacao === 'cotado' && p.preco != null;
        const prazo = prazoDe(p);
        return (
          <button key={p.id} type="button" disabled={!clicavel} onClick={() => clicavel && onEscolher!(p)}
            className={cn('w-full text-left rounded-md border px-3 py-2 text-sm',
              escolhido && 'border-primary bg-primary/10', clicavel && !escolhido && 'hover:bg-muted', !clicavel && 'cursor-default')}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
              <b>{escolhido && <Check className="h-4 w-4 inline mr-1 text-primary" />}{nomeDe(p)}</b>
              <span className={r.cls}>{r.txt}</span>
              {p.marca && <span>{p.marca}</span>}
              {verPreco && p.preco != null && <span className="font-semibold">{brl(p.preco)}</span>}
              {prazo && <span className="text-muted-foreground">Prazo: {prazo}</span>}
              <span className="text-xs text-muted-foreground ml-auto">{diasAtras(p.created_at)}</span>
            </div>
            {p.motivo && <p className="text-xs text-muted-foreground mt-0.5">{p.motivo}</p>}
          </button>
        );
      })}
      {aguardando.map((id) => (
        <div key={id} className="rounded-md border border-dashed px-3 py-2 text-sm flex items-center gap-3">
          <b>{cot.representantes.find((r) => r.id === id)?.nome ?? 'Representante'}</b>
          <span className="text-yellow-600">⏳ Aguardando resposta</span>
        </div>
      ))}
    </div>
  );
}
