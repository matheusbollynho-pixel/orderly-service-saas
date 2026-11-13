// v2: barra de período única (Relatórios; depois o Caixa usa a mesma).
// [Dia] [Semana] [Mês] [Escolher] + ‹ › pra andar. Semana termina no dia do acerto (padrão sábado).
import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { andar, iso, periodoAnterior, periodoAte, rotuloPeriodo, type ModoPeriodo, type Periodo } from '@/lib/periodo';

export interface PeriodoEscolhido { modo: ModoPeriodo; atual: Periodo; anterior: Periodo }

const MODOS: { m: ModoPeriodo; nome: string }[] = [
  { m: 'dia', nome: 'Dia' }, { m: 'semana', nome: 'Semana' }, { m: 'mes', nome: 'Mês' }, { m: 'livre', nome: 'Escolher' },
];

export function usePeriodo(inicial: ModoPeriodo = 'mes', diaAcerto = 6) {
  const [modo, setModo] = useState<ModoPeriodo>(inicial);
  const [ref, setRef] = useState(() => new Date());
  const [livre, setLivre] = useState<Periodo>(() => { const h = iso(new Date()); return { ini: h, fim: h }; });
  const hoje = new Date();
  const atual = modo === 'livre' ? livre : periodoAte(modo, ref, hoje, diaAcerto);
  const escolhido: PeriodoEscolhido = { modo, atual, anterior: periodoAnterior(modo, atual) };
  return { escolhido, modo, setModo, ref, setRef, livre, setLivre, diaAcerto };
}

export function BarraPeriodo({ p }: { p: ReturnType<typeof usePeriodo> }) {
  const { modo, setModo, ref, setRef, livre, setLivre, escolhido } = p;
  const noFuturo = modo !== 'livre' && escolhido.atual.fim >= iso(new Date());
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-4 gap-1 rounded-xl bg-muted/50 p-1">
        {MODOS.map(({ m, nome }) => (
          <button key={m} type="button" onClick={() => { setModo(m); setRef(new Date()); }}
            className={cn('h-10 rounded-lg text-sm font-semibold', modo === m ? 'bg-background text-foreground shadow' : 'text-muted-foreground')}>
            {nome}
          </button>
        ))}
      </div>
      {modo === 'livre' ? (
        <div className="grid grid-cols-2 gap-2">
          <Input type="date" value={livre.ini} max={livre.fim} onChange={(e) => e.target.value && setLivre({ ...livre, ini: e.target.value })} className="h-11" aria-label="De" />
          <Input type="date" value={livre.fim} min={livre.ini} onChange={(e) => e.target.value && setLivre({ ...livre, fim: e.target.value })} className="h-11" aria-label="Até" />
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <Button variant="outline" size="icon" className="h-11 w-11" onClick={() => setRef(andar(modo, ref, -1))} aria-label="Anterior"><ChevronLeft className="h-5 w-5" /></Button>
          <div className="text-center">
            <p className="font-display text-lg font-bold leading-tight">{rotuloPeriodo(escolhido.atual)}</p>
            <p className="text-xs text-muted-foreground">comparando com {rotuloPeriodo(escolhido.anterior)}</p>
          </div>
          <Button variant="outline" size="icon" className="h-11 w-11" disabled={noFuturo} onClick={() => setRef(andar(modo, ref, 1))} aria-label="Próximo"><ChevronRight className="h-5 w-5" /></Button>
        </div>
      )}
      {modo === 'livre' && <p className="text-center text-xs text-muted-foreground">comparando com {rotuloPeriodo(escolhido.anterior)}</p>}
    </div>
  );
}
