import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { MaintenanceKeywordsManager } from '@/components/MaintenanceKeywordsManager';
import { Settings, Trash2, MessageCircle, Clock, Zap, Send, RotateCcw } from 'lucide-react';

export default function ConfigToolsPage() {
  const { user, isRestrictedUser } = useAuth();
  const [showKeywords, setShowKeywords] = useState(false);

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
        <Button variant="default" className="w-full flex items-center gap-2">
          <Settings size={18} /> Tirar OS de Concluída e Entregue
        </Button>
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
