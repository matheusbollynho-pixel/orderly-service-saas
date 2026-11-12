// v2: abas no topo de uma área (ex.: Caixa → Hoje | Fiado | Contas a pagar).
import { Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TELAS, type Acesso, type View } from '@/lib/navegacao';

export function AbasArea({ abas, atual, acessoDe, onAba, acoes }: {
  abas: View[];
  atual: View;
  acessoDe: (v: View) => Acesso;
  onAba: (v: View) => void;
  acoes?: React.ReactNode;   // botões da área (ex.: Nova OS / Express na Oficina)
}) {
  const visiveis = abas.filter((v) => acessoDe(v) !== 'sem_permissao');
  if (visiveis.length <= 1 && !acoes) return null;
  return (
    <div className="mb-4 space-y-3">
      {visiveis.length > 1 && (
        <div className="flex gap-1 rounded-xl bg-muted/50 p-1">
          {visiveis.map((v) => {
            const plano = acessoDe(v) === 'plano';
            return (
              <button
                key={v}
                type="button"
                onClick={() => onAba(v)}
                className={cn(
                  'flex min-h-[44px] flex-1 items-center justify-center gap-1 rounded-lg px-2 text-sm font-semibold transition-colors',
                  atual === v ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                  plano && 'opacity-60',
                )}
              >
                {TELAS[v].nome}
                {plano && <Lock className="h-3 w-3 text-yellow-500" />}
              </button>
            );
          })}
        </div>
      )}
      {acoes && <div className="flex gap-2">{acoes}</div>}
    </div>
  );
}
