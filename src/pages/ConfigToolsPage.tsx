import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { useServiceOrders } from '@/hooks/useServiceOrders';
import { useAuth } from '@/hooks/useAuth';
import { MaintenanceKeywordsManager } from '@/components/MaintenanceKeywordsManager';
import { useStoreSettings } from '@/hooks/useStoreSettings';
import { Settings, Trash2, MessageCircle, Clock, Zap, Send, RotateCcw, Building2 } from 'lucide-react';

export default function ConfigToolsPage() {
  const { user, isRestrictedUser } = useAuth();
  const [showKeywords, setShowKeywords] = useState(false);
  const [removeOsId, setRemoveOsId] = useState("");
  const { settings, loading: loadingSettings, saving, saveSettings } = useStoreSettings();
  const [companyName, setCompanyName] = useState('');
  const [template, setTemplate] = useState('');

  const { updateOrder, isUpdating } = useServiceOrders();

  function handleAlterarParaAberta(osId: string) {
    const sanitizedId = osId.trim();
    if (!sanitizedId || !updateOrder || typeof updateOrder !== 'function') return;
    updateOrder({ id: sanitizedId, status: 'aberta' });
  }

  // Sync local state when settings load
  if (settings && companyName === '' && template === '') {
    setCompanyName(settings.company_name);
    setTemplate(settings.whatsapp_confirmation_template);
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
          <Button variant="default" className="w-full flex items-center gap-2" disabled={!removeOsId.trim() || isUpdating} onClick={() => handleAlterarParaAberta(removeOsId)}>
            <Settings size={18} /> Alterar OS para "Aberta"
          </Button>
        </div>
      </div>
      {/* Configurações da loja */}
      <div className="mt-8 border border-white/10 rounded-lg p-4 space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Building2 size={20} /> Configurações da Loja
        </h2>
        {loadingSettings ? (
          <p className="text-sm text-neutral-400">Carregando...</p>
        ) : (
          <>
            <div className="space-y-1">
              <label className="text-xs text-neutral-400 font-medium">Nome da empresa</label>
              <input
                type="text"
                value={companyName}
                onChange={e => setCompanyName(e.target.value)}
                placeholder="Ex: Bandara Motos"
                className="w-full p-2 border border-white/20 rounded text-sm bg-black/30 text-neutral-200"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-neutral-400 font-medium">Mensagem de confirmação de agendamento (WhatsApp)</label>
              <p className="text-xs text-neutral-500">Variáveis disponíveis: {'{{nome}}'} {'{{empresa}}'} {'{{data}}'} {'{{turno}}'} {'{{moto}}'} {'{{servico}}'}</p>
              <textarea
                rows={10}
                value={template}
                onChange={e => setTemplate(e.target.value)}
                placeholder="Digite a mensagem de confirmação..."
                className="w-full p-2 border border-white/20 rounded text-sm bg-black/30 text-neutral-200 font-mono"
              />
            </div>
            <Button
              className="w-full"
              disabled={saving}
              onClick={() => saveSettings({ company_name: companyName, whatsapp_confirmation_template: template })}
            >
              {saving ? 'Salvando...' : 'Salvar configurações'}
            </Button>
          </>
        )}
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
