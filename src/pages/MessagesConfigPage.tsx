import { useState, useEffect } from 'react';
import { useStoreSettings } from '@/hooks/useStoreSettings';
import { Button } from '@/components/ui/button';
import { MessageSquare } from 'lucide-react';

const VARIABLES = ['{{nome}}', '{{empresa}}', '{{data}}', '{{turno}}', '{{moto}}', '{{servico}}'];

export default function MessagesConfigPage() {
  const { settings, loading, saving, saveSettings } = useStoreSettings();
  const [companyName, setCompanyName] = useState('');
  const [template, setTemplate] = useState('');
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (settings && !initialized) {
      setCompanyName(settings.company_name);
      setTemplate(settings.whatsapp_confirmation_template);
      setInitialized(true);
    }
  }, [settings, initialized]);

  if (loading) {
    return <div className="p-8 text-center text-neutral-400">Carregando...</div>;
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <MessageSquare size={24} /> Configurações de Mensagens
      </h1>

      <div className="space-y-4 border border-white/10 rounded-lg p-4">
        <h2 className="text-base font-semibold text-neutral-200">Confirmação de Agendamento (WhatsApp)</h2>

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
            rows={12}
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
    </div>
  );
}
