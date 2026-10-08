import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { useStore } from '@/contexts/StoreContext';
import { usePlanFeatures } from '@/hooks/usePlanFeatures';
import { chamarWhatsappConexao } from '@/components/WhatsappConexao';

/**
 * Faixa no topo pro dono quando o WhatsApp da loja cai (ex: removeu o aparelho
 * em "Aparelhos conectados"). Só em plano com WhatsApp e só se a loja já tem
 * instância — quem nunca conectou não vê. Divide o cache com o card de Configurações.
 */
export function WhatsappAvisoQueda() {
  const { isOwner } = useStore();
  const { canAccess } = usePlanFeatures();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const ativo = isOwner && canAccess('pos-venda') && !pathname.startsWith('/print') && pathname !== '/config';

  const { data } = useQuery({
    queryKey: ['whatsapp-conexao'],
    queryFn: () => chamarWhatsappConexao('status'),
    enabled: ativo,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
    retry: false,
  });

  if (!ativo || !data?.ok || data.status !== 'desconectado') return null;

  return (
    <div className="bg-red-600 text-white px-4 py-2 text-sm flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
      <span className="flex items-center gap-2 font-medium">
        <AlertTriangle size={16} /> Seu WhatsApp desconectou — as mensagens automáticas não estão saindo.
      </span>
      <button
        type="button"
        onClick={() => navigate('/config?aba=mensagens')}
        className="underline font-semibold hover:opacity-90"
      >
        Reconectar agora
      </button>
    </div>
  );
}
