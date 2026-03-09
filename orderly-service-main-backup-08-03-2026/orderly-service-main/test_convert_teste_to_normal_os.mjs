import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://xqndblstrblqleraepzs.supabase.co';
const supabaseKey = 'sb_publishable_IbA1JjUujCSjpu-Qi01rwg_FPEoGyS4';
const clientName = 'TESTE TESTE TESTET';

const sb = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: orders, error: orderError } = await sb
    .from('service_orders')
    .select('id, client_name, client_id, client_phone, client_address, client_cpf, equipment, problem_description, atendimento_id, mechanic_id, created_at')
    .ilike('client_name', `%${clientName}%`)
    .order('created_at', { ascending: false })
    .limit(1);

  if (orderError || !orders?.length) {
    console.error('❌ OS não encontrada:', orderError?.message || 'sem dados');
    process.exit(1);
  }

  const order = orders[0];

  const { data: staff } = await sb
    .from('staff_members')
    .select('id, name')
    .order('name')
    .limit(1);

  const { data: mecs } = await sb
    .from('mechanics')
    .select('id, name')
    .order('name')
    .limit(1);

  const atendimentoId = order.atendimento_id || staff?.[0]?.id || null;
  const mechanicId = order.mechanic_id || mecs?.[0]?.id || null;

  const { error: updOrderError } = await sb
    .from('service_orders')
    .update({
      equipment: order.equipment === 'Avaliação de balcão' ? 'Honda CG 160 Fan' : order.equipment,
      problem_description: order.problem_description || 'Revisão geral',
      atendimento_id: atendimentoId,
      mechanic_id: mechanicId,
    })
    .eq('id', order.id);

  if (updOrderError) {
    console.error('❌ Erro atualizando OS:', updOrderError.message);
    process.exit(1);
  }

  const { data: rating } = await sb
    .from('satisfaction_ratings')
    .select('id, public_token')
    .eq('order_id', order.id)
    .limit(1)
    .maybeSingle();

  let token = rating?.public_token;

  if (!token) {
    token = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { error: insError } = await sb
      .from('satisfaction_ratings')
      .insert({
        order_id: order.id,
        client_id: order.client_id || null,
        atendimento_id: atendimentoId,
        mechanic_id: mechanicId,
        public_token: token,
        status: 'pendente',
      });

    if (insError) {
      console.error('❌ Erro criando rating:', insError.message);
      process.exit(1);
    }
  } else {
    const { error: updRatingError } = await sb
      .from('satisfaction_ratings')
      .update({
        atendimento_id: atendimentoId,
        mechanic_id: mechanicId,
      })
      .eq('id', rating.id);

    if (updRatingError) {
      console.error('❌ Erro sincronizando rating:', updRatingError.message);
      process.exit(1);
    }
  }

  console.log('✅ Ordem convertida para OS normal e sincronizada');
  console.log('🔗 LINK_LOCAL:', `http://localhost:8080/avaliar/${token}`);
  console.log('🧑 Balconista ID:', atendimentoId);
  console.log('🔧 Mecânico ID:', mechanicId);
}

main().catch((e) => {
  console.error('❌ Erro inesperado:', e.message);
  process.exit(1);
});
