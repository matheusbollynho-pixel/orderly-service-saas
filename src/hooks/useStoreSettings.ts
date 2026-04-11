import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useStore } from '@/contexts/StoreContext';

export interface StoreSettings {
  id: string;
  company_name: string;
  store_phone: string;
  store_address: string;
  store_cnpj: string;
  store_instagram: string;
  store_owner: string;
  whatsapp_confirmation_template: string;
  whatsapp_satisfaction_template: string;
  whatsapp_birthday_template: string;
  whatsapp_balcao_followup_template: string;
  max_agendamentos_dia: number;
  ai_enabled: boolean;
  ai_notes: string;
  boleto_notify_phone_1?: string | null;
  boleto_notify_phone_2?: string | null;
  asaas_api_key?: string | null;
  instagram_url?: string | null;
  google_maps_url?: string | null;
  opening_hours?: string | null;
  payment_methods?: string | null;
}

const DEFAULTS: Omit<StoreSettings, 'id'> = {
  company_name: import.meta.env.VITE_COMPANY_NAME || 'Minha Oficina',
  store_phone: '',
  store_address: '',
  store_cnpj: '',
  store_instagram: '',
  store_owner: '',
  whatsapp_confirmation_template: `Olá{{nome}}! 👋

Seu agendamento na *{{empresa}}* foi confirmado! ✅

📅 *Data:* {{data}}
🕐 *Turno:* {{turno}}
🏍️ *Moto:* {{moto}}
🔧 *Serviço:* {{servico}}

Qualquer dúvida, é só chamar. Te esperamos! 😊

*{{empresa}}* 🏍️🔧`,
  whatsapp_satisfaction_template: `Olá, {{nome}}! 👋

Aqui é da *{{empresa}}*.

Sua opinião é muito importante para melhorarmos sempre.
Pode avaliar seu atendimento em menos de 1 minuto? ⭐

{{link}}

Obrigado pela confiança! 🏍️🔧`,
  whatsapp_birthday_template: `🎉 *Feliz aniversário!* 🎂🥳

A equipe da *{{empresa}}* deseja muitas conquistas e bons quilômetros pela frente! 🏍️💨

Pra comemorar, você ganhou:
🎁 *15% de desconto* em serviços da oficina ou peças à vista.

⏰ Válido por 7 dias.
É só apresentar esta mensagem 😉

*{{empresa}}* — cuidando da sua moto como você merece!`,
  max_agendamentos_dia: 10,
  ai_enabled: true,
  ai_notes: '',
  whatsapp_balcao_followup_template: `Olá{{nome}}! 👋

Aqui é da *{{empresa}}*.

Passando para saber se tudo ficou certinho com seu atendimento da nota *#{{numero}}*. Ficou alguma dúvida ou podemos ajudar em algo? 😊

Se quiser, deixa sua avaliação — leva menos de 1 minuto e nos ajuda muito! ⭐

{{link}}

Att, {{atendente}} 🏍️🔧`,
};

export function useStoreSettings() {
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const { storeId } = useStore();

  useEffect(() => {
    if (storeId) load();
  }, [storeId]);

  async function load() {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('store_settings').select('*').eq('id', storeId!).maybeSingle();
      if (error) console.error('useStoreSettings error:', error);
      if (data) setSettings(data as StoreSettings);
    } finally {
      setLoading(false);
    }
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
