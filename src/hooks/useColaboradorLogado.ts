// Quem é o login atual (mecânico ou atendente), quando a conta é pessoal.
// Conta compartilhada (ex.: "Gerente" no PC da loja) devolve null e as telas perguntam "Quem está fazendo?".
import { useStore } from '@/contexts/StoreContext';
import { useMechanics } from '@/hooks/useMechanics';
import { useTeamMembers } from '@/hooks/useTeamMembers';

export function useColaboradorLogado(): { tipo: 'mecanico' | 'atendente'; id: string; nome: string } | null {
  const { colaborador } = useStore();
  const { mechanics } = useMechanics();
  const { members } = useTeamMembers();
  if (!colaborador) return null;
  const lista = colaborador.tipo === 'mecanico' ? mechanics : members;
  const nome = lista.find((p) => p.id === colaborador.id)?.name?.trim();
  return { ...colaborador, nome: nome || '' };
}
