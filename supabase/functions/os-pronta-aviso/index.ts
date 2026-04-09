/**
 * os-pronta-aviso
 * Cron a cada 2 horas no horário comercial (8h-18h BRT).
 * Itera por loja ativa — envia aviso de OS pronta para cada cliente.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendWhatsAppText, normalizeBrPhone, type StoreWhatsAppConfig } from '../_shared/whatsapp.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const DONO_PHONE = Deno.env.get('DONO_PHONE') || '';
const AVISO_RETIRADA_HORAS = parseInt(Deno.env.get('AVISO_RETIRADA_HORAS') || '4');

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function processarLoja(store: { id: string; company_name: string; whatsapp_provider: string | null; whatsapp_instance_url: string | null; whatsapp_instance_token: string | null }) {
  const wppConfig: StoreWhatsAppConfig = {
    provider: store.whatsapp_provider || undefined,
    instance_url: store.whatsapp_instance_url || undefined,
    instance_token: store.whatsapp_instance_token || undefined,
  };
  const agora = new Date();
  const limiteHoras = new Date(agora.getTime() - AVISO_RETIRADA_HORAS * 60 * 60 * 1000).toISOString();
  const company_name = store.company_name || 'Oficina';

  const { data: ordens, error } = await sb
    .from('service_orders')
    .select('id, client_name, client_phone, equipment, conclusion_date, aviso_retirada_enviado_em')
    .eq('store_id', store.id)
    .eq('status', 'concluido')
    .is('aviso_retirada_enviado_em', null)
    .not('client_phone', 'is', null)
    .lt('conclusion_date', limiteHoras)
    .limit(50);

  if (error || !ordens?.length) return { store_id: store.id, enviados: 0 };

  let enviados = 0;
  for (const os of ordens) {
    if (!os.client_phone) continue;
    const phone = os.client_phone.replace(/\D/g, '');
    if (phone.length < 10) continue;

    const nome = os.client_name?.split(' ')[0] || 'Cliente';
    const moto = os.equipment || 'sua moto';
    const msg = `Olá ${nome}! 🏍️\n\nPassando pra avisar que *${moto}* está prontinha aqui na *${company_name}* esperando por você!\n\nPode passar quando puder, estaremos te esperando 😊`;

    try {
      await sendWhatsAppText(normalizeBrPhone(phone), msg, wppConfig);
      await sb.from('service_orders')
        .update({ aviso_retirada_enviado_em: agora.toISOString() })
        .eq('id', os.id);
      enviados++;
      console.log(`✅ [${company_name}] Aviso enviado para ${os.client_name}`);
    } catch (e) {
      console.error(`❌ [${company_name}] Erro para ${os.client_name}:`, e);
    }
  }

  // Verificar OS sem retirada há 24h e alertar dono
  const limite24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: semRetirada } = await sb
    .from('service_orders')
    .select('id, client_name, equipment')
    .eq('store_id', store.id)
    .eq('status', 'concluido')
    .not('aviso_retirada_enviado_em', 'is', null)
    .lt('aviso_retirada_enviado_em', limite24h)
    .limit(20);

  if (semRetirada?.length && DONO_PHONE) {
    const lista = semRetirada.map(o => `• ${o.client_name} — ${o.equipment || 'moto'}`).join('\n');
    try {
      await sendWhatsAppText(normalizeBrPhone(DONO_PHONE),
        `⚠️ *[${company_name}] OS prontas há +24h sem retirada:*\n\n${lista}`);
    } catch (_) { /* silencioso */ }
  }

  return { store_id: store.id, company: company_name, enviados };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  try {
    const { data: stores, error } = await sb
      .from('store_settings')
      .select('id, company_name, whatsapp_provider, whatsapp_instance_url, whatsapp_instance_token')
      .eq('active', true);

    if (error) throw error;

    const results = [];
    for (const store of stores || []) {
      const result = await processarLoja(store);
      results.push(result);
    }

    const totalEnviados = results.reduce((s, r) => s + r.enviados, 0);
    console.log(`📊 Total: ${totalEnviados} avisos em ${results.length} loja(s)`);

    return new Response(JSON.stringify({ success: true, lojas: results.length, enviados: totalEnviados }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('❌ Erro:', error);
    return new Response(JSON.stringify({ success: false, error: String(error) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});
