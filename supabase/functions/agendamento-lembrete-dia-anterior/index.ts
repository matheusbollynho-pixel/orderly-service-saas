/**
 * agendamento-lembrete-dia-anterior
 * Cron diário às 18h BRT (21h UTC).
 * Verifica agendamentos do dia seguinte e envia lembrete com pedido de confirmação.
 * Se cliente responder NÃO → cancela agendamento e notifica dono.
 * Se não responder em 2h → mantém agendamento.
 *
 * MULTI-TENANT: cada lembrete sai pela instância de WhatsApp DA LOJA do agendamento.
 * Loja sem instância própria (e que não seja a legada/Bandara) é pulada — nunca
 * cai de volta pra instância global, senão o número da Bandara vaza pros clientes
 * de outras oficinas.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendWhatsAppText, normalizeBrPhone, type StoreWhatsAppConfig } from '../_shared/whatsapp.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const DONO_PHONE = Deno.env.get('DONO_PHONE') || '';
// Loja "dona" da instância global/legada (Bandara Motos) — pode usar env como fallback.
const LEGACY_DEFAULT_STORE_ID = '9fd27114-97d1-48cd-ad09-1b057fa9c185';

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const TURNO_LABEL: Record<string, string> = {
  MANHA: 'Manhã',
  TARDE: 'Tarde',
  dia_todo: 'Dia todo',
};

interface StoreRow {
  id: string;
  company_name: string | null;
  whatsapp_provider: string | null;
  whatsapp_instance_url: string | null;
  whatsapp_instance_token: string | null;
  boleto_notify_phone_1: string | null;
  store_phone: string | null;
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function wppConfigFromStore(store: StoreRow): StoreWhatsAppConfig {
  return {
    provider: store.whatsapp_provider || undefined,
    instance_url: store.whatsapp_instance_url || undefined,
    instance_token: store.whatsapp_instance_token || undefined,
  };
}

// Loja pode disparar? Precisa ter instância própria, exceto a legada (Bandara).
function lojaPodeEnviar(store: StoreRow): boolean {
  return !!store.whatsapp_instance_url || store.id === LEGACY_DEFAULT_STORE_ID;
}

async function enviarAlertaDono(phone: string, msg: string, wppConfig: StoreWhatsAppConfig | undefined, storeId: string): Promise<void> {
  if (!phone) return;
  try {
    // Sem wppConfig = alerta interno da loja legada pela instância global (permitido só aqui).
    await sendWhatsAppText(normalizeBrPhone(phone), msg, wppConfig, {
      storeId,
      feature: 'agendamento_lembrete',
      allowGlobalFallback: wppConfig === undefined,
    });
  } catch (e) {
    console.error('Erro ao alertar dono:', e);
  }
}

async function enviarLembretes(): Promise<void> {
  // Calcular data de amanhã
  const amanha = new Date();
  amanha.setDate(amanha.getDate() + 1);
  const amanhaStr = amanha.toISOString().split('T')[0];

  console.log(`📅 Buscando agendamentos para ${amanhaStr}...`);

  const { data: agendamentos, error } = await sb
    .from('appointments')
    .select('id, store_id, client_name, client_phone, appointment_date, shift, equipment, service_description, lembrete_enviado_em')
    .eq('appointment_date', amanhaStr)
    .neq('status', 'cancelado')
    .is('lembrete_enviado_em', null)
    .not('client_phone', 'is', null)
    .limit(200);

  if (error) {
    console.error('Erro ao buscar agendamentos:', error);
    return;
  }

  if (!agendamentos || agendamentos.length === 0) {
    console.log('✅ Nenhum agendamento para amanhã sem lembrete enviado');
    return;
  }

  type Ag = {
    id: string;
    store_id: string;
    client_name: string;
    client_phone: string | null;
    appointment_date: string;
    shift: string;
    equipment: string | null;
    service_description: string | null;
    lembrete_enviado_em: string | null;
  };
  const lista = agendamentos as Ag[];

  // Carrega as lojas envolvidas de uma vez
  const storeIds = [...new Set(lista.map((a) => a.store_id).filter(Boolean))];
  const { data: stores } = await sb
    .from('store_settings')
    .select('id, company_name, whatsapp_provider, whatsapp_instance_url, whatsapp_instance_token, boleto_notify_phone_1, store_phone')
    .in('id', storeIds);
  const storeMap = new Map<string, StoreRow>((stores as StoreRow[] || []).map((s) => [s.id, s]));

  console.log(`📬 ${lista.length} agendamento(s) em ${storeIds.length} loja(s)`);

  let enviados = 0;
  let erros = 0;
  let pulados = 0;
  const enviadosPorLoja = new Map<string, Ag[]>();

  for (const ag of lista) {
    if (!ag.client_phone) continue;

    const phone = ag.client_phone.replace(/\D/g, '');
    if (phone.length < 10) continue;

    const store = ag.store_id ? storeMap.get(ag.store_id) : undefined;
    if (!store) {
      pulados++;
      console.warn(`⏭️ Agendamento ${ag.id} sem loja (${ag.store_id}) — pulado`);
      continue;
    }
    if (!lojaPodeEnviar(store)) {
      pulados++;
      console.log(`⏭️ Loja ${store.company_name || store.id} sem WhatsApp próprio — lembrete não enviado`);
      continue;
    }

    const wppConfig = wppConfigFromStore(store);
    const empresa = store.company_name || 'nossa oficina';
    const nome = ag.client_name?.split(' ')[0] || 'Cliente';
    const dataFmt = formatDate(ag.appointment_date);
    const turno = TURNO_LABEL[ag.shift] || ag.shift;
    const moto = ag.equipment || 'seu veículo';
    const servico = ag.service_description || 'serviço agendado';

    const msg =
      `Olá ${nome}! 👋\n\n` +
      `Lembrando do seu agendamento de amanhã na *${empresa}*:\n\n` +
      `📅 *Data:* ${dataFmt}\n` +
      `🕐 *Turno:* ${turno}\n` +
      `🏍️ *Veículo:* ${moto}\n` +
      `🔧 *Serviço:* ${servico}\n\n` +
      `Confirma sua presença? Responda *SIM* ou *NÃO* 😊`;

    try {
      await sendWhatsAppText(normalizeBrPhone(phone), msg, wppConfig, {
        storeId: store.id,
        feature: 'agendamento_lembrete',
      });

      // Marcar lembrete como enviado
      await sb
        .from('appointments')
        .update({ lembrete_enviado_em: new Date().toISOString() })
        .eq('id', ag.id);

      // Salvar estado de confirmação na conversa para a IA interpretar a resposta
      await sb.from('conversation_state').upsert(
        {
          phone: phone,
          state: 'confirmacao_lembrete',
          context: {
            lembrete_agendamento_id: ag.id,
            client_name: ag.client_name,
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'phone' }
      );

      enviados++;
      const arr = enviadosPorLoja.get(store.id) || [];
      arr.push(ag);
      enviadosPorLoja.set(store.id, arr);
      console.log(`✅ Lembrete enviado para ${phone} — agendamento ${ag.id} (${empresa})`);
    } catch (e) {
      erros++;
      console.error(`❌ Erro ao enviar lembrete para ${phone}:`, e);
    }
  }

  console.log(`\n📊 Lembretes: ${enviados} enviados, ${erros} erros, ${pulados} pulados`);

  // Resumo pro dono de cada loja (pela instância da própria loja)
  for (const [storeId, ags] of enviadosPorLoja) {
    if (ags.length === 0) continue;
    const store = storeMap.get(storeId);
    if (!store) continue;

    const resumo = ags
      .map((a) => `• ${a.client_name} — ${TURNO_LABEL[a.shift] || a.shift} — ${a.equipment || ''} — ${a.service_description || ''}`)
      .join('\n');
    const texto = `📅 *Agendamentos de amanhã (${amanhaStr}):*\n\n${resumo}\n\nLembretes enviados: ${ags.length}`;

    if (storeId === LEGACY_DEFAULT_STORE_ID) {
      // Loja legada: mantém o alerta pro número de operação (DONO_PHONE / env global)
      await enviarAlertaDono(DONO_PHONE, texto, undefined, storeId);
    } else {
      const donoPhone = store.boleto_notify_phone_1 || store.store_phone || '';
      await enviarAlertaDono(donoPhone, texto, wppConfigFromStore(store), storeId);
    }
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    await enviarLembretes();

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('❌ Erro no agendamento-lembrete-dia-anterior:', error);
    return new Response(JSON.stringify({ success: false, error: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
