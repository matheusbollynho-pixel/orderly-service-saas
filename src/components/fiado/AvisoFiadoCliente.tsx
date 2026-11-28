// Aviso do fiado do cliente: atrasado (na nota e na OS) e, ao registrar fiado, aprovação e limite.
// O banco é quem barra de verdade; aqui é só para a pessoa saber antes de tentar.
import { AlertTriangle } from 'lucide-react';
import { useFiadoCliente } from '@/hooks/useFiadoCliente';
import { useStoreSettings } from '@/hooks/useStoreSettings';

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** `valorNovo` = valor do fiado que vai ser registrado (mostra aprovação e limite). Sem ele, só o aviso de atraso. */
export function AvisoFiadoCliente({ clientId, valorNovo }: { clientId?: string | null; valorNovo?: number }) {
  const { data: sit } = useFiadoCliente(clientId);
  const { settings } = useStoreSettings();
  const exige = !!(settings as { fiado_exige_aprovacao?: boolean } | null)?.fiado_exige_aprovacao;
  const registrando = valorNovo !== undefined;

  if (registrando && exige && !clientId) {
    return <p className="text-sm text-red-600 font-medium">Escolha um cliente cadastrado: esta loja só vende fiado para cliente aprovado.</p>;
  }
  if (!sit) return null;
  // Só para a loja que controla fiado (aprovação ligada) ou cliente com limite: quem não usa não vê mudança
  if (!exige && sit.limite == null) return null;
  const linhas: { texto: string; forte?: boolean }[] = [];
  if (sit.atrasado > 0) linhas.push({ texto: `Fiado atrasado: ${brl(sit.atrasado)} (${sit.qtdAtrasados} ${sit.qtdAtrasados === 1 ? 'conta' : 'contas'})` });
  if (registrando && exige && !sit.aprovado) linhas.push({ texto: 'Cliente não aprovado para fiado. O dono ou gerente libera na ficha do cliente (Clientes).', forte: true });
  if (registrando && sit.limite != null) {
    const passa = (valorNovo ?? 0) > (sit.disponivel ?? 0) + 0.004;
    linhas.push({ texto: `Limite ${brl(sit.limite)} · em aberto ${brl(sit.aberto)} · ainda cabe ${brl(sit.disponivel ?? 0)}${passa ? ' — este fiado passa do limite' : ''}`, forte: passa });
  }
  if (!linhas.length) return null;
  return (
    <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 space-y-0.5">
      {linhas.map((l, i) => (
        <p key={i} className={`flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400 ${l.forte ? 'font-semibold' : ''}`}>
          {i === 0 && <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />}{i > 0 && <span className="w-3.5 shrink-0" />}{l.texto}
        </p>
      ))}
    </div>
  );
}
