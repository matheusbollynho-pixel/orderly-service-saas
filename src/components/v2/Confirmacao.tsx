// v2: janela padrão de confirmação e de pergunta (substitui confirm() e prompt() do navegador).
// Celular: abre de baixo, botão da ação em cima e Cancelar embaixo (onde o polegar alcança).
// PC: janela no centro, Cancelar à esquerda.
//
// Uso:  if (await confirmar({ titulo: 'Excluir OS #1234 do João?', verbo: 'Excluir', perigo: true })) ...
//       const motivo = await pedirTexto({ titulo: 'Motivo do estorno', obrigatorio: true, multilinha: true });
import { useEffect, useRef, useState } from 'react';
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export interface OpcoesConfirmar {
  titulo: string;
  descricao?: string;
  verbo?: string;        // texto do botão da ação (padrão: "Confirmar")
  perigo?: boolean;      // ação que apaga/cancela: botão vermelho
  cancelar?: string;
}

export interface OpcoesTexto extends Omit<OpcoesConfirmar, 'perigo'> {
  rotulo?: string;
  valorInicial?: string;
  placeholder?: string;
  obrigatorio?: boolean;
  multilinha?: boolean;
  numerico?: boolean;
}

type Pedido =
  | { tipo: 'confirmar'; op: OpcoesConfirmar; resolver: (v: boolean) => void }
  | { tipo: 'texto'; op: OpcoesTexto; resolver: (v: string | null) => void };

let abrirPedido: ((p: Pedido) => void) | null = null;
const fila: Pedido[] = [];

function enviar(p: Pedido) {
  if (abrirPedido) abrirPedido(p);
  else fila.push(p);
}

export function confirmar(op: OpcoesConfirmar): Promise<boolean> {
  return new Promise((resolver) => enviar({ tipo: 'confirmar', op, resolver }));
}

export function pedirTexto(op: OpcoesTexto): Promise<string | null> {
  return new Promise((resolver) => enviar({ tipo: 'texto', op, resolver }));
}

/** Monta uma vez no App. */
export function ConfirmacaoHost() {
  const [atual, setAtual] = useState<Pedido | null>(null);
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState('');
  const pendentes = useRef<Pedido[]>([]);
  const atualRef = useRef<Pedido | null>(null);

  const mostrar = (p: Pedido | null) => {
    atualRef.current = p;
    if (p?.tipo === 'texto') { setTexto(p.op.valorInicial ?? ''); setErro(''); }
    setAtual(p);
  };

  useEffect(() => {
    abrirPedido = (p) => {
      if (atualRef.current) pendentes.current.push(p);   // uma pergunta por vez
      else mostrar(p);
    };
    while (fila.length) abrirPedido(fila.shift()!);
    return () => { abrirPedido = null; };
  }, []);

  const fechar = (resposta: boolean | string | null) => {
    const p = atualRef.current;
    if (!p) return;
    if (p.tipo === 'confirmar') p.resolver(resposta === true);
    else p.resolver(typeof resposta === 'string' ? resposta : null);
    mostrar(pendentes.current.shift() ?? null);
  };

  const confirmarTexto = () => {
    if (atual?.tipo !== 'texto') return;
    const v = texto.trim();
    if (atual.op.obrigatorio && !v) { setErro('Preencha para continuar.'); return; }
    fechar(v);
  };

  if (!atual) return null;
  const { op } = atual;
  const perigo = atual.tipo === 'confirmar' && atual.op.perigo;

  return (
    <AlertDialog open onOpenChange={(aberto) => { if (!aberto) fechar(atual.tipo === 'confirmar' ? false : null); }}>
      <AlertDialogContent
        className={cn(
          'max-sm:top-auto max-sm:bottom-0 max-sm:translate-y-0 max-sm:rounded-t-2xl max-sm:rounded-b-none max-sm:pb-8',
          'max-sm:data-[state=open]:slide-in-from-bottom-1/2 max-sm:data-[state=closed]:slide-out-to-bottom-1/2',
        )}
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="text-left">{op.titulo}</AlertDialogTitle>
          {op.descricao && <AlertDialogDescription className="text-left whitespace-pre-line">{op.descricao}</AlertDialogDescription>}
        </AlertDialogHeader>

        {atual.tipo === 'texto' && (
          <div className="space-y-1">
            {atual.op.rotulo && <label className="text-sm font-medium">{atual.op.rotulo}</label>}
            {atual.op.multilinha ? (
              <Textarea autoFocus rows={3} value={texto} placeholder={atual.op.placeholder}
                onChange={(e) => { setTexto(e.target.value); setErro(''); }} />
            ) : (
              <Input autoFocus value={texto} placeholder={atual.op.placeholder}
                inputMode={atual.op.numerico ? 'decimal' : undefined}
                onChange={(e) => { setTexto(e.target.value); setErro(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter') confirmarTexto(); }} />
            )}
            {erro && <p className="text-sm text-destructive">{erro}</p>}
          </div>
        )}

        {/* Celular: ação em cima, Cancelar embaixo. PC: Cancelar à esquerda. */}
        <div className="flex flex-col gap-2 sm:flex-row-reverse sm:justify-start">
          <Button
            variant={perigo ? 'destructive' : 'default'}
            className="h-12 sm:h-10"
            onClick={() => (atual.tipo === 'texto' ? confirmarTexto() : fechar(true))}
          >
            {op.verbo ?? 'Confirmar'}
          </Button>
          <Button variant="outline" className="h-12 sm:h-10"
            onClick={() => fechar(atual.tipo === 'confirmar' ? false : null)}>
            {op.cancelar ?? 'Cancelar'}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
