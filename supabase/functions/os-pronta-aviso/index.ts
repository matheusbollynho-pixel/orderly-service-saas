/**
 * os-pronta-aviso
 * Cron a cada 2 horas no horário comercial (8h-18h BRT).
 * Itera por loja ativa — envia aviso de OS pronta para cada cliente.
 *
 * Até 12/11/2026 nunca enviou nada: filtrava status 'concluido' (não existe; o certo é 'concluida').
 * Ao consertar: só OS concluídas nas últimas 24h (havia ~700 antigas sem aviso — nada de disparo em massa).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendWhatsAppText, normalizeBrPhone, type StoreWhatsAppConfig } from '../_shared/whatsapp.ts';
import { criarRitmo, dentroDoHorarioComercial, emSegundoPlano, MAX_POR_RODADA } from '../_shared/ritmo.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// Dono (12/11/2026): marcou Concluída = avisa o cliente na próxima rodada (sem esperar). Concluída e Entregue não avisa (já buscou).
const AVISO_RETIRADA_HORAS = parseInt(Deno.env.get('AVISO_RETIRADA_HORAS') || '0');

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function processarLoja(store: { id: string; company_name: string; whatsapp_provider: string | null; whatsapp_instance_url: string | null; whatsapp_instance_token: string | null }, ritmo: ReturnType<typeof criarRitmo>) {
  const wppConfig: StoreWhatsAppConfig = {
    provider: store.whatsapp_provider || undefined,
    instance_url: store.whatsapp_instance_url || undefined,
    instance_token: store.whatsapp_instance_token || undefined,
  };
  const agora = new Date();
  // Espera no mínimo 10 min depois de ficar Pronta: dá tempo de desfazer ou de avisar pela tela (sem duplicar)
  const esperaMin = Math.max(AVISO_RETIRADA_HORAS * 60, 10);
  const limiteHoras = new Date(agora.getTime() - esperaMin * 60 * 1000).toISOString();
  // Nada retroativo: só OS concluídas nas últimas 24h.
  const janela24h = new Date(agora.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const company_name = store.company_name || 'Oficina';

  const { data: ordens, error } = await sb
    .from('service_orders')
    .select('id, client_name, client_phone, equipment, conclusion_date, aviso_retirada_enviado_em')
    .eq('store_id', store.id)
    .eq('status', 'concluida')
    .is('aviso_retirada_enviado_em', null)
    .not('client_phone', 'is', null)
    .gte('conclusion_date', janela24h)
    .lt('conclusion_date', limiteHoras)
    .limit(50);

  if (error || !ordens?.length) return { store_id: store.id, enviados: 0 };

  let enviados = 0;
  for (const os of ordens) {
    if (!os.client_phone) continue;
    const phone = os.client_phone.replace(/\D/g, '');
    if (phone.length < 10) continue;
    // O resto fica pendente e sai na próxima rodada (ver _shared/ritmo.ts)
    if (enviados >= MAX_POR_RODADA || !(await ritmo.podeEnviar())) break;

    const nome = os.client_name?.split(' ')[0] || 'Cliente';
    const moto = os.equipment || 'sua moto';
    const msg = `Olá ${nome}! 🏍️\n\nPassando pra avisar que *${moto}* está prontinha aqui na *${company_name}* esperando por você!\n\nPode passar quando puder, estaremos te esperando 😊`;

    try {
      await sendWhatsAppText(normalizeBrPhone(phone), msg, wppConfig, { storeId: store.id, feature: 'os_pronta' });
      await sb.from('service_orders')
        .update({ aviso_retirada_enviado_em: agora.toISOString() })
        .eq('id', os.id);
      enviados++;
      console.log(`✅ [${company_name}] Aviso enviado para ${os.client_name}`);
    } catch (e) {
      console.error(`❌ [${company_name}] Erro para ${os.client_name}:`, e);
    }
  }

  // DESLIGADO (12/11/2026): o alerta "OS prontas há +24h sem retirada" mandava para um número único
  // (DONO_PHONE, global), com clientes de TODAS as lojas, e repetiria a cada 2h (não marca que já avisou).
  // Refazer depois: para o dono de cada loja, uma vez por OS.

  return { store_id: store.id, company: company_name, enviados };
}

async function rodada() {
  const { data: stores, error } = await sb
    .from('store_settings')
    .select('id, company_name, whatsapp_provider, whatsapp_instance_url, whatsapp_instance_token')
    .eq('active', true);
  if (error) throw error;

  const ritmo = criarRitmo();
  const results = [];
  for (const store of stores || []) {
    results.push(await processarLoja(store, ritmo));
  }

  const totalEnviados = results.reduce((s, r) => s + r.enviados, 0);
  console.log(`📊 Total: ${totalEnviados} avisos em ${results.length} loja(s)`);
}

Deno.serve((req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  // Só o cron chama (segredo enviado por public.cron_http)
  const segredo = Deno.env.get('CRON_SECRET');
  if (!segredo || req.headers.get('x-cron-secret') !== segredo) {
    return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 });
  }
  if (!dentroDoHorarioComercial()) {
    return new Response(JSON.stringify({ ok: true, fora_do_horario: true }), { headers: { 'Content-Type': 'application/json' } });
  }
  return emSegundoPlano('os-pronta-aviso', rodada);
});
