import { Button } from '@/components/ui/button';
import { useState, useEffect } from 'react';
import { useServiceOrders } from '@/hooks/useServiceOrders';
import { useAuth } from '@/hooks/useAuth';
import { MaintenanceKeywordsManager } from '@/components/MaintenanceKeywordsManager';
import { useStoreSettings } from '@/hooks/useStoreSettings';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Settings, Zap, MessageSquare } from 'lucide-react';

const VARIABLES = ['{{nome}}', '{{empresa}}', '{{data}}', '{{turno}}', '{{moto}}', '{{servico}}'];

export default function ConfigToolsPage() {
  const { user, isRestrictedUser } = useAuth();
  const [showKeywords, setShowKeywords] = useState(false);
  const [removeOsId, setRemoveOsId] = useState("");
  const { settings, loading: loadingSettings, saving, saveSettings } = useStoreSettings();
  const [companyName, setCompanyName] = useState('');
  const [template, setTemplate] = useState('');
  const [initialized, setInitialized] = useState(false);

  const { updateOrder, isUpdating } = useServiceOrders();

  useEffect(() => {
    if (settings && !initialized) {
      setCompanyName(settings.company_name);
      setTemplate(settings.whatsapp_confirmation_template);
      setInitialized(true);
    }
  }, [settings, initialized]);

  function handleAlterarParaAberta(osId: string) {
    const sanitizedId = osId.trim();
    if (!sanitizedId || !updateOrder || typeof updateOrder !== 'function') return;
    updateOrder({ id: sanitizedId, status: 'aberta' });
  }

  if (!user || isRestrictedUser) {
    return <div className="p-8 text-center text-red-500">Acesso restrito.</div>;
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <Settings size={24} /> Configurações
      </h1>

      <Tabs defaultValue="ferramentas">
        <TabsList className="w-full mb-6">
          <TabsTrigger value="ferramentas" className="flex-1 flex items-center gap-2">
            <Settings size={15} /> Ferramentas
          </TabsTrigger>
          <TabsTrigger value="mensagens" className="flex-1 flex items-center gap-2">
            <MessageSquare size={15} /> Mensagens
          </TabsTrigger>
        </TabsList>

        {/* ABA FERRAMENTAS */}
        <TabsContent value="ferramentas" className="space-y-6">
          <div className="space-y-4">
            <div className="w-full flex flex-col gap-2">
              <label htmlFor="removeOsId" className="text-xs text-neutral-400 mb-1 font-medium">
                ID da OS para tirar de Concluída e Entregue:
              </label>
              <input
                id="removeOsId"
                type="text"
                value={removeOsId}
                onChange={e => setRemoveOsId(e.target.value)}
                placeholder="Cole o ID da OS aqui"
                className="w-full p-2 border border-white/20 rounded text-xs bg-black/30 text-neutral-200 mb-2"
              />
              <Button
                variant="default"
                className="w-full flex items-center gap-2"
                disabled={!removeOsId.trim() || isUpdating}
                onClick={() => handleAlterarParaAberta(removeOsId)}
              >
                <Settings size={18} /> Alterar OS para "Aberta"
              </Button>
            </div>
          </div>

          <div>
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
        </TabsContent>

        {/* ABA MENSAGENS */}
        <TabsContent value="mensagens" className="space-y-6">
          {loadingSettings ? (
            <p className="text-sm text-neutral-400">Carregando...</p>
          ) : (
            <div className="border border-white/10 rounded-lg p-4 space-y-4">
              <h2 className="text-base font-semibold">Confirmação de Agendamento (WhatsApp)</h2>

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
                <label className="text-xs text-neutral-400 font-medium">Mensagem</label>
                <div className="flex flex-wrap gap-1 mb-1">
                  {VARIABLES.map(v => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setTemplate(t => t + v)}
                      className="text-xs bg-white/10 hover:bg-white/20 text-neutral-300 px-2 py-0.5 rounded font-mono transition-colors"
                    >
                      {v}
                    </button>
                  ))}
                </div>
                <textarea
                  rows={10}
                  value={template}
                  onChange={e => setTemplate(e.target.value)}
                  placeholder="Digite a mensagem de confirmação..."
                  className="w-full p-2 border border-white/20 rounded text-sm bg-black/30 text-neutral-200 font-mono"
                />
              </div>

              <div className="border border-white/10 rounded p-3 bg-black/20">
                <p className="text-xs text-neutral-500 mb-1 font-medium">Pré-visualização</p>
                <pre className="text-xs text-neutral-300 whitespace-pre-wrap font-sans">
                  {template
                    .replace(/\{\{nome\}\}/g, ', João')
                    .replace(/\{\{empresa\}\}/g, companyName || 'Minha Oficina')
                    .replace(/\{\{data\}\}/g, 'quarta-feira, 19/03/2026')
                    .replace(/\{\{turno\}\}/g, 'Manhã')
                    .replace(/\{\{moto\}\}/g, 'CG 125 2020')
                    .replace(/\{\{servico\}\}/g, 'Troca de óleo')
                  }
                </pre>
              </div>

              <Button
                className="w-full"
                disabled={saving}
                onClick={() => saveSettings({ company_name: companyName, whatsapp_confirmation_template: template })}
              >
                {saving ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
