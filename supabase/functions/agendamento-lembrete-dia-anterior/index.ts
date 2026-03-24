/**
 * agendamento-lembrete-dia-anterior
 * Cron diário às 18h BRT (21h UTC).
 * Verifica agendamentos do dia seguinte e envia lembrete com pedido de confirmação.
 * Se cliente responder NÃO → cancela agendamento e notifica dono.
 * Se não responder em 2h → mantém agendamento.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendWhatsAppText, normalizeBrPhone } from '../_shared/whatsapp.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const DONO_PHONE = Deno.env.get('DONO_PHONE') || '';

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const TURNO_LABEL: Record<string, string> = {
  MANHA: 'Manhã',
  TARDE: 'Tarde',
  dia_todo: 'Dia todo',
};

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

async function enviarAlertaDono(msg: string): Promise<void> {
  if (!DONO_PHONE) return;
  try {
    await sendWhatsAppText(normalizeBrPhone(DONO_PHONE), msg);
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
    .select('id, client_name, client_phone, appointment_date, shift, equipment, service_description, lembrete_enviado_em')
    .eq('appointment_date', amanhaStr)
    .neq('status', 'cancelado')
    .is('lembrete_enviado_em', null)
    .not('client_phone', 'is', null)
    .limit(50);

  if (error) {
    console.error('Erro ao buscar agendamentos:', error);
    return;
  }

  if (!agendamentos || agendamentos.length === 0) {
    console.log('✅ Nenhum agendamento para amanhã sem lembrete enviado');
    return;
  }

  console.log(`📬 ${agendamentos.length} agendamento(s) para notificar`);

  let enviados = 0;
  let erros = 0;

  for (const ag of agendamentos as {
    id: string;
    client_name: string;
    client_phone: string | null;
    appointment_date: string;
    shift: string;
    equipment: string | null;
    service_description: string | null;
    lembrete_enviado_em: string | null;
  }[]) {
    if (!ag.client_phone) continue;

    const phone = ag.client_phone.replace(/\D/g, '');
    if (phone.length < 10) continue;

    const nome = ag.client_name?.split(' ')[0] || 'Cliente';
    const dataFmt = formatDate(ag.appointment_date);
    const turno = TURNO_LABEL[ag.shift] || ag.shift;
    const moto = ag.equipment || 'sua moto';
    const servico = ag.service_description || 'serviço agendado';

    const msg =
      `Olá ${nome}! 👋\n\n` +
      `Lembrando do seu agendamento de amanhã na *Bandara Motos*:\n\n` +
      `📅 *Data:* ${dataFmt}\n` +
      `🕐 *Turno:* ${turno}\n` +
      `🏍️ *Moto:* ${moto}\n` +
      `🔧 *Serviço:* ${servico}\n\n` +
      `Confirma sua presença? Responda *SIM* ou *NÃO* 😊`;

    try {
      await sendWhatsAppText(normalizeBrPhone(phone), msg);

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
      console.log(`✅ Lembrete enviado para ${phone} — agendamento ${ag.id}`);
    } catch (e) {
      erros++;
      console.error(`❌ Erro ao enviar lembrete para ${phone}:`, e);
    }
  }

  console.log(`\n📊 Lembretes: ${enviados} enviados, ${erros} erros`);

  // Alertar dono com resumo dos agendamentos de amanhã
  if (enviados > 0) {
    const lista = (agendamentos as {
      client_name: string;
      shift: string;
      equipment: string | null;
      service_description: string | null;
    }[])
      .map((a) => `• ${a.client_name} — ${TURNO_LABEL[a.shift] || a.shift} — ${a.equipment || ''} — ${a.service_description || ''}`)
      .join('\n');

    await enviarAlertaDono(
      `📅 *Agendamentos de amanhã (${amanhaStr}):*\n\n${lista}\n\nLembretes enviados: ${enviados}`
    );
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
