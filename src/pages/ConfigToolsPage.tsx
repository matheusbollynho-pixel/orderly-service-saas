import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { useServiceOrders } from '@/hooks/useServiceOrders';
import { useAuth } from '@/hooks/useAuth';
import { MaintenanceKeywordsManager } from '@/components/MaintenanceKeywordsManager';
import { Settings, Trash2, MessageCircle, Clock, Zap, Send, RotateCcw } from 'lucide-react';

export default function ConfigToolsPage() {
  const { user, isRestrictedUser } = useAuth();
  const [showKeywords, setShowKeywords] = useState(false);
  const [removeOsId, setRemoveOsId] = useState("");

  const { updateOrderMutation } = useServiceOrders();

  function handleAlterarParaAberta(osId: string) {
    if (!osId.trim()) return;
    updateOrderMutation.mutate({ id: osId, status: 'aberta' });
  }

  if (!user || isRestrictedUser) {
    return <div className="p-8 text-center text-red-500">Acesso restrito.</div>;
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <Settings size={24} /> Ferramentas Administrativas
      </h1>
      <div className="space-y-4">
        <Button variant="destructive" className="w-full flex items-center gap-2">
          <Trash2 size={18} /> Limpar fotos antigas
        </Button>
        <Button variant="default" className="w-full flex items-center gap-2">
          <MessageCircle size={18} /> Testar pesquisa satisfação
        </Button>
        <Button variant="default" className="w-full flex items-center gap-2">
          <Clock size={18} /> Testar pesquisa (4s)
        </Button>
        <Button variant="default" className="w-full flex items-center gap-2">
          <Zap size={18} /> Gerenciar keywords manutenção
        </Button>
        <Button variant="default" className="w-full flex items-center gap-2">
          <Send size={18} /> Enviar link satisfação
        </Button>
        <Button variant="default" className="w-full flex items-center gap-2">
          <RotateCcw size={18} /> Resetar satisfação
        </Button>
        <div className="w-full flex flex-col gap-2">
          <label htmlFor="removeOsId" className="text-xs text-neutral-400 mb-1 font-medium">ID da OS para tirar de Concluída e Entregue:</label>
          <input id="removeOsId" type="text" value={removeOsId} onChange={e => setRemoveOsId(e.target.value)} placeholder="Cole o ID da OS aqui" className="w-full p-2 border border-white/20 rounded text-xs bg-black/30 text-neutral-200 mb-2" />
          <Button variant="default" className="w-full flex items-center gap-2" disabled={!removeOsId.trim() || updateOrderMutation.isLoading} onClick={() => handleAlterarParaAberta(removeOsId)}>
            <Settings size={18} /> Alterar OS para "Aberta"
          </Button>
        </div>
      </div>
      <div className="mt-8">
        {!showKeywords ? (
          <Button variant="outline" className="w-full mb-2" onClick={() => setShowKeywords(true)}>
            <Zap size={18} /> Mostrar gerenciador de keywords
          </Button>
        ) : (
          <>
            <Button variant="outline" className="w-full mb-2" onClick={() => setShowKeywords(false)}>
              Ocultar gerenciador de keywords
            </Button>
            <MaintenanceKeywordsManager />
          </>
        )}
      </div>
    </div>
  );
}
