// v2: menu de baixo com 5 áreas fixas (sem rolar para o lado). Celular primeiro.
import { Home, Wrench, ShoppingCart, Wallet, Menu, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Area } from '@/lib/navegacao';

const AREAS: { id: Area; nome: string; icone: typeof Home }[] = [
  { id: 'inicio', nome: 'Início', icone: Home },
  { id: 'oficina', nome: 'Oficina', icone: Wrench },
  { id: 'balcao', nome: 'Balcão', icone: ShoppingCart },
  { id: 'caixa', nome: 'Caixa', icone: Wallet },
  { id: 'mais', nome: 'Mais', icone: Menu },
];

export function NavPrincipal({ ativa, visivel, bloqueada, onArea }: {
  ativa: Area;
  visivel: (a: Area) => boolean;
  bloqueada: (a: Area) => boolean;   // só por plano: aparece com cadeado
  onArea: (a: Area) => void;
}) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-neutral-900/95 text-white backdrop-blur-md pb-safe">
      <div className="mx-auto flex h-16 max-w-3xl items-stretch">
        {AREAS.filter((a) => visivel(a.id)).map(({ id, nome, icone: Icone }) => {
          const ativo = ativa === id;
          const travada = bloqueada(id);
          return (
            <button
              key={id}
              type="button"
              onClick={() => onArea(id)}
              aria-current={ativo ? 'page' : undefined}
              className={cn(
                'relative flex flex-1 flex-col items-center justify-center gap-1 transition-colors',
                ativo ? 'text-primary' : 'text-gray-300 hover:text-white',
                travada && 'opacity-50',
              )}
            >
              {ativo && <span className="absolute top-0 h-0.5 w-10 rounded-full bg-primary" />}
              <Icone className="h-6 w-6" />
              <span className="text-[13px] font-semibold leading-none">{nome}</span>
              {travada && <Lock className="absolute right-[22%] top-2 h-3 w-3 text-yellow-400" />}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
