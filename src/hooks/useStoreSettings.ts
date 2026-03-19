import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface StoreSettings {
  id: string;
  company_name: string;
  whatsapp_confirmation_template: string;
}

const DEFAULT_TEMPLATE = `Olá{{nome}}! 👋

Seu agendamento na *{{empresa}}* foi confirmado! ✅

📅 *Data:* {{data}}
🕐 *Turno:* {{turno}}
🏍️ *Moto:* {{moto}}
🔧 *Serviço:* {{servico}}

Qualquer dúvida, é só chamar. Te esperamos! 😊

*{{empresa}}* 🏍️🔧`;

export function useStoreSettings() {
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('store_settings').select('*').limit(1).maybeSingle();
    if (data) {
      setSettings(data as StoreSettings);
    } else {
      // Cria linha padrão se não existir
      const { data: created } = await supabase
        .from('store_settings')
        .insert({ company_name: 'Minha Oficina', whatsapp_confirmation_template: DEFAULT_TEMPLATE })
        .select()
        .single();
      if (created) setSettings(created as StoreSettings);
    }
    setLoading(false);
  }

  async function saveSettings(updated: Partial<StoreSettings>) {
    if (!settings) return;
    setSaving(true);
    const { data, error } = await supabase
      .from('store_settings')
      .update(updated)
      .eq('id', settings.id)
      .select()
      .single();
    setSaving(false);
    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
      return;
    }
    setSettings(data as StoreSettings);
    toast({ title: 'Configurações salvas!' });
  }

  return { settings, loading, saving, saveSettings };
}
