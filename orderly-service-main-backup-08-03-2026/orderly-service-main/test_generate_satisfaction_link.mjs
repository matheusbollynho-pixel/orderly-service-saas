import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://xqndblstrblqleraepzs.supabase.co';
const supabaseKey = 'sb_publishable_IbA1JjUujCSjpu-Qi01rwg_FPEoGyS4';
const clientName = process.argv[2] || 'TESTE TESTE TESTET';

const sb = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: orders, error: orderError } = await sb
    .from('service_orders')
    .select('id, client_name, client_id, atendimento_id, mechanic_id, equipment, created_at')
    .ilike('client_name', `%${clientName}%`)
    .order('created_at', { ascending: false })
    .limit(20);

  if (orderError) {
    console.error('❌ Erro ao buscar OS:', orderError.message);
    process.exit(1);
  }

  const normalOrder = (orders || []).find((o) => o.equipment !== 'Avaliação de balcão');
  const walkinOrder = (orders || []).find((o) => o.equipment === 'Avaliação de balcão');
  const order = normalOrder || walkinOrder;

  if (!order) {
    console.error('❌ Nenhuma OS encontrada para:', clientName);
    process.exit(1);
  }

  let token = null;

  const { data: existing } = await sb
    .from('satisfaction_ratings')
    .select('id, public_token, responded_at')
    .eq('order_id', order.id)
    .limit(1)
    .maybeSingle();

  if (existing?.public_token) {
    token = existing.public_token;

    // Mantém atendimento/mecânico sincronizados com a OS
    await sb
      .from('satisfaction_ratings')
      .update({
        atendimento_id: order.atendimento_id || null,
        mechanic_id: order.mechanic_id || null,
      })
      .eq('id', existing.id);
  } else {
    token = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const { error: insertError } = await sb
      .from('satisfaction_ratings')
      .insert({
        order_id: order.id,
        client_id: order.client_id || null,
        atendimento_id: order.atendimento_id || null,
        mechanic_id: order.mechanic_id || null,
        public_token: token,
        status: 'pendente',
      });

    if (insertError) {
      console.error('❌ Erro ao criar rating:', insertError.message);
      process.exit(1);
    }
  }

  const localUrl = `http://localhost:8080/avaliar/${token}`;
  const prodUrl = `https://xqndblstrblqleraepzs.supabase.co/functions/v1/satisfaction-public?token=${token}`;

  console.log('✅ OS encontrada:', order.id);
  console.log('👤 Cliente:', order.client_name);
  console.log('🏷️ Equipamento:', order.equipment);
  console.log('🧭 Tipo de fluxo:', order.equipment === 'Avaliação de balcão' ? 'QR / Walk-in' : 'OS normal');
  console.log('🔗 LINK_LOCAL:', localUrl);
  console.log('🔗 TOKEN:', token);
  console.log('🔎 API_GET:', prodUrl);
}

main().catch((e) => {
  console.error('❌ Erro inesperado:', e.message);
  process.exit(1);
});
