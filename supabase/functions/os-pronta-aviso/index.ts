/**
 * os-pronta-aviso
 * Cron a cada 2 horas no horário comercial (8h-18h BRT).
 * Verifica OS com status "concluido" há mais de N horas sem retirada
 * e envia aviso ao cliente. Alerta o dono se passar 24h sem retirada.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendWhatsAppText, normalizeBrPhone } from '../_shared/whatsapp.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const DONO_PHONE = Deno.env.get('DONO_PHONE') || '';
const AVISO_RETIRADA_HORAS = parseInt(Deno.env.get('AVISO_RETIRADA_HORAS') || '4');

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function enviarAlertaDono(msg: string): Promise<void> {
  if (!DONO_PHONE) return;
  try {
    await sendWhatsAppText(normalizeBrPhone(DONO_PHONE), msg);
  } catch (e) {
    console.error('Erro ao alertar dono:', e);
  }
}

async function processarOSProntas(): Promise<void> {
  const agora = new Date();

  // Buscar OS com status "concluido" + sem aviso enviado + concluída há mais de X horas
  const limiteHoras = new Date(agora.getTime() - AVISO_RETIRADA_HORAS * 60 * 60 * 1000).toISOString();

  const { data: ordens, error } = await sb
    .from('service_orders')
    .select('id, client_name, client_phone, equipment, conclusion_date, aviso_retirada_enviado_em')
    .eq('status', 'concluido')
    .is('aviso_retirada_enviado_em', null)
    .not('client_phone', 'is', null)
    .lt('conclusion_date', limiteHoras)
    .limit(50);

  if (error) {
    console.error('Erro ao buscar OS prontas:', error);
    return;
  }

  if (!ordens || ordens.length === 0) {
    console.log('✅ Nenhuma OS pronta aguardando retirada no momento');
    return;
  }

  console.log(`🏍️ ${ordens.length} OS(s) prontas para notificar`);

  for (const os of ordens as {
    id: string;
    client_name: string;
    client_phone: string | null;
    equipment: string | null;
    conclusion_date: string | null;
    aviso_retirada_enviado_em: string | null;
  }[]) {
    if (!os.client_phone) continue;

    const phone = os.client_phone.replace(/\D/g, '');
    if (phone.length < 10) continue;

    const nome = os.client_name?.split(' ')[0] || 'Cliente';
    const moto = os.equipment || 'sua moto';
    const msg = `Olá ${nome}! 🏍️\n\n` +
      `Passando pra avisar que *${moto}* está prontinha aqui na *Bandara Motos* esperando por você!\n\n` +
      `Pode passar quando puder, estaremos te esperando 😊`;

    try {
      await sendWhatsAppText(normalizeBrPhone(phone), msg);

      // Marcar aviso como enviado
      await sb
        .from('service_orders')
        .update({ aviso_retirada_enviado_em: agora.toISOString() })
        .eq('id', os.id);

      console.log(`✅ Aviso enviado para ${phone} — OS ${os.id}`);
    } catch (e) {
      console.error(`❌ Erro ao enviar aviso para ${phone}:`, e);
    }
  }
}

async function verificarOSSemRetirada24h(): Promise<void> {
  // OS com aviso enviado há mais de 24h e ainda com status "concluido"
  const limite24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: ordens } = await sb
    .from('service_orders')
    .select('id, client_name, client_phone, equipment, aviso_retirada_enviado_em')
    .eq('status', 'concluido')
    .not('aviso_retirada_enviado_em', 'is', null)
    .lt('aviso_retirada_enviado_em', limite24h)
    .limit(20);

  if (!ordens || ordens.length === 0) return;

  const lista = (ordens as { client_name: string; equipment: string | null; id: string }[])
    .map((o) => `• ${o.client_name} — ${o.equipment || 'moto'} (OS ${o.id.slice(-8)})`)
    .join('\n');

  await enviarAlertaDono(
    `⚠️ *OS prontas há mais de 24h sem retirada:*\n\n${lista}\n\nConsidere entrar em contato diretamente.`
  );

  console.log(`⚠️ ${ordens.length} OS(s) com mais de 24h sem retirada — dono notificado`);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    await processarOSProntas();
    await verificarOSSemRetirada24h();

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('❌ Erro no os-pronta-aviso:', error);
    return new Response(JSON.stringify({ success: false, error: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
