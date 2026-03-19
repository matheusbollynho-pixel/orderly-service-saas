import { Button } from '@/components/ui/button';
import { useState, useEffect } from 'react';
import { useServiceOrders } from '@/hooks/useServiceOrders';
import { useAuth } from '@/hooks/useAuth';
import { MaintenanceKeywordsManager } from '@/components/MaintenanceKeywordsManager';
import { useStoreSettings, StoreSettings } from '@/hooks/useStoreSettings';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Settings, Zap, MessageSquare, CalendarCheck, Star, Cake, ShoppingCart, Store } from 'lucide-react';
import { cn } from '@/lib/utils';

type MessageKey = 'whatsapp_confirmation_template' | 'whatsapp_satisfaction_template' | 'whatsapp_birthday_template' | 'whatsapp_balcao_followup_template';

interface MessageConfig {
  key: MessageKey;
  label: string;
  icon: React.ElementType;
  variables: string[];
  preview: (template: string, company: string) => string;
}

const MESSAGE_CONFIGS: MessageConfig[] = [
  {
    key: 'whatsapp_confirmation_template',
    label: 'Confirmação de Agendamento',
    icon: CalendarCheck,
    variables: ['{{nome}}', '{{empresa}}', '{{data}}', '{{turno}}', '{{moto}}', '{{servico}}'],
    preview: (t, c) => t
      .replace(/\{\{nome\}\}/g, ', João')
      .replace(/\{\{empresa\}\}/g, c)
      .replace(/\{\{data\}\}/g, 'quarta-feira, 19/03/2026')
      .replace(/\{\{turno\}\}/g, 'Manhã')
      .replace(/\{\{moto\}\}/g, 'CG 125 2020')
      .replace(/\{\{servico\}\}/g, 'Troca de óleo'),
  },
  {
    key: 'whatsapp_satisfaction_template',
    label: 'Pesquisa de Satisfação',
    icon: Star,
    variables: ['{{nome}}', '{{empresa}}', '{{link}}'],
    preview: (t, c) => t
      .replace(/\{\{nome\}\}/g, 'João')
      .replace(/\{\{empresa\}\}/g, c)
      .replace(/\{\{link\}\}/g, 'https://seusite.com/avaliar/abc123'),
  },
  {
    key: 'whatsapp_birthday_template',
    label: 'Aniversário',
    icon: Cake,
    variables: ['{{nome}}', '{{empresa}}'],
    preview: (t, c) => t
      .replace(/\{\{nome\}\}/g, ', João')
      .replace(/\{\{empresa\}\}/g, c),
  },
  {
    key: 'whatsapp_balcao_followup_template',
    label: 'Follow-up Balcão',
    icon: ShoppingCart,
    variables: ['{{nome}}', '{{empresa}}', '{{numero}}', '{{atendente}}', '{{link}}'],
    preview: (t, c) => t
      .replace(/\{\{nome\}\}/g, ', João')
      .replace(/\{\{empresa\}\}/g, c)
      .replace(/\{\{numero\}\}/g, '42')
      .replace(/\{\{atendente\}\}/g, `*Carlos* - ${c}`)
      .replace(/\{\{link\}\}/g, 'https://seusite.com/avaliar/loja'),
  },
];

export default function ConfigToolsPage() {
  const { user, isRestrictedUser } = useAuth();
  const [showKeywords, setShowKeywords] = useState(false);
  const [removeOsId, setRemoveOsId] = useState('');
  const { settings, loading: loadingSettings, saving, saveSettings } = useStoreSettings();
  const [companyName, setCompanyName] = useState('');
  const [storePhone, setStorePhone] = useState('');
  const [storeAddress, setStoreAddress] = useState('');
  const [storeCnpj, setStoreCnpj] = useState('');
  const [storeInstagram, setStoreInstagram] = useState('');
  const [storeOwner, setStoreOwner] = useState('');
  const [templates, setTemplates] = useState<Record<MessageKey, string>>({
    whatsapp_confirmation_template: '',
    whatsapp_satisfaction_template: '',
    whatsapp_birthday_template: '',
    whatsapp_balcao_followup_template: '',
  });
  const [selectedMessage, setSelectedMessage] = useState<MessageKey>('whatsapp_confirmation_template');
  const [initialized, setInitialized] = useState(false);

  const { updateOrder, isUpdating } = useServiceOrders();

  useEffect(() => {
    if (settings && !initialized) {
      setCompanyName(settings.company_name);
      setStorePhone(settings.store_phone || '');
      setStoreAddress(settings.store_address || '');
      setStoreCnpj(settings.store_cnpj || '');
      setStoreInstagram(settings.store_instagram || '');
      setStoreOwner(settings.store_owner || '');
      setTemplates({
        whatsapp_confirmation_template: settings.whatsapp_confirmation_template,
        whatsapp_satisfaction_template: settings.whatsapp_satisfaction_template,
        whatsapp_birthday_template: settings.whatsapp_birthday_template,
        whatsapp_balcao_followup_template: settings.whatsapp_balcao_followup_template,
      });
      setInitialized(true);
    }
  }, [settings, initialized]);

  function handleAlterarParaAberta(osId: string) {
    const sanitizedId = osId.trim();
    if (!sanitizedId || !updateOrder || typeof updateOrder !== 'function') return;
    updateOrder({ id: sanitizedId, status: 'aberta' });
  }

  function handleSave() {
    saveSettings({
      company_name: companyName,
      store_phone: storePhone,
      store_address: storeAddress,
      store_cnpj: storeCnpj,
      store_instagram: storeInstagram,
      store_owner: storeOwner,
      ...templates,
    } as Partial<StoreSettings>);
  }

  if (!user || isRestrictedUser) {
    return <div className="p-8 text-center text-red-500">Acesso restrito.</div>;
  }

  const currentConfig = MESSAGE_CONFIGS.find(m => m.key === selectedMessage)!;
  const currentTemplate = templates[selectedMessage];

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <Settings size={24} /> Configurações
      </h1>

      <Tabs defaultValue="loja">
        <TabsList className="w-full mb-6">
          <TabsTrigger value="loja" className="flex-1 flex items-center gap-2">
            <Store size={15} /> Loja
          </TabsTrigger>
          <TabsTrigger value="mensagens" className="flex-1 flex items-center gap-2">
            <MessageSquare size={15} /> Mensagens
          </TabsTrigger>
          <TabsTrigger value="ferramentas" className="flex-1 flex items-center gap-2">
            <Settings size={15} /> Ferramentas
          </TabsTrigger>
        </TabsList>

        {/* ABA LOJA */}
        <TabsContent value="loja" className="space-y-4">
          {loadingSettings ? (
            <p className="text-sm text-neutral-400">Carregando...</p>
          ) : (
            <>
              {[
                { label: 'Nome da empresa', value: companyName, set: setCompanyName, placeholder: 'Ex: Bandara Motos' },
                { label: 'Telefone / WhatsApp', value: storePhone, set: setStorePhone, placeholder: 'Ex: (75) 98804-6356' },
                { label: 'Endereço', value: storeAddress, set: setStoreAddress, placeholder: 'Ex: Rua das Motos, 123 - Cidade-BA' },
                { label: 'CNPJ', value: storeCnpj, set: setStoreCnpj, placeholder: 'Ex: 00.000.000/0001-00' },
                { label: 'Instagram', value: storeInstagram, set: setStoreInstagram, placeholder: 'Ex: @BandaraMotos' },
                { label: 'Razão Social', value: storeOwner, set: setStoreOwner, placeholder: 'Ex: João da Silva ME' },
              ].map(({ label, value, set, placeholder }) => (
                <div key={label} className="space-y-1">
                  <label className="text-xs text-neutral-400 font-medium">{label}</label>
                  <input
                    type="text"
                    value={value}
                    onChange={e => set(e.target.value)}
                    placeholder={placeholder}
                    className="w-full p-2 border border-white/20 rounded text-sm bg-black/30 text-neutral-200"
                  />
                </div>
              ))}
              <Button className="w-full" disabled={saving} onClick={handleSave}>
                {saving ? 'Salvando...' : 'Salvar informações'}
              </Button>
            </>
          )}
        </TabsContent>

        {/* ABA FERRAMENTAS */}
        <TabsContent value="ferramentas" className="space-y-6">
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
        <TabsContent value="mensagens" className="space-y-4">
          {loadingSettings ? (
            <p className="text-sm text-neutral-400">Carregando...</p>
          ) : (
            <>
              {/* Nome da empresa (global) */}
              <div className="space-y-1">
                <label className="text-xs text-neutral-400 font-medium">Nome da empresa (usado em todas as mensagens)</label>
                <input
                  type="text"
                  value={companyName}
                  onChange={e => setCompanyName(e.target.value)}
                  placeholder="Ex: Bandara Motos"
                  className="w-full p-2 border border-white/20 rounded text-sm bg-black/30 text-neutral-200"
                />
              </div>

              {/* Seletor de mensagem */}
              <div className="grid grid-cols-2 gap-2">
                {MESSAGE_CONFIGS.map(cfg => {
                  const Icon = cfg.icon;
                  return (
                    <button
                      key={cfg.key}
                      type="button"
                      onClick={() => setSelectedMessage(cfg.key)}
                      className={cn(
                        'flex items-center gap-2 p-3 rounded-lg border text-sm font-medium transition-colors text-left',
                        selectedMessage === cfg.key
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-white/10 bg-black/20 text-neutral-300 hover:border-white/30'
                      )}
                    >
                      <Icon size={16} className="flex-shrink-0" />
                      {cfg.label}
                    </button>
                  );
                })}
              </div>

              {/* Editor da mensagem selecionada */}
              <div className="border border-white/10 rounded-lg p-4 space-y-3">
                <h3 className="text-sm font-semibold text-neutral-200 flex items-center gap-2">
                  <currentConfig.icon size={15} />
                  {currentConfig.label}
                </h3>

                <div className="flex flex-wrap gap-1">
                  {currentConfig.variables.map(v => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setTemplates(prev => ({ ...prev, [selectedMessage]: prev[selectedMessage] + v }))}
                      className="text-xs bg-white/10 hover:bg-white/20 text-neutral-300 px-2 py-0.5 rounded font-mono transition-colors"
                    >
                      {v}
                    </button>
                  ))}
                </div>

                <textarea
                  rows={10}
                  value={currentTemplate}
                  onChange={e => setTemplates(prev => ({ ...prev, [selectedMessage]: e.target.value }))}
                  placeholder="Digite a mensagem..."
                  className="w-full p-2 border border-white/20 rounded text-sm bg-black/30 text-neutral-200 font-mono"
                />

                <div className="border border-white/10 rounded p-3 bg-black/20">
                  <p className="text-xs text-neutral-500 mb-2 font-medium">Pré-visualização</p>
                  <pre className="text-xs text-neutral-300 whitespace-pre-wrap font-sans">
                    {currentConfig.preview(currentTemplate, companyName || 'Minha Oficina')}
                  </pre>
                </div>
              </div>

              <Button className="w-full" disabled={saving} onClick={handleSave}>
                {saving ? 'Salvando...' : 'Salvar todas as mensagens'}
              </Button>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
