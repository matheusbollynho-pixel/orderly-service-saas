import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://xqndblstrblqleraepzs.supabase.co';
const supabaseKey = 'sb_publishable_IbA1JjUujCSjpu-Qi01rwg_FPEoGyS4';

const sb = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('🔍 Contando avaliações antes da limpeza...');
  const { count: beforeCount, error: countBeforeError } = await sb
    .from('satisfaction_ratings')
    .select('*', { count: 'exact', head: true });

  if (countBeforeError) {
    console.error('❌ Erro ao contar antes:', countBeforeError.message);
    process.exit(1);
  }

  console.log(`📊 Total antes: ${beforeCount ?? 0}`);

  const { error: deleteError } = await sb
    .from('satisfaction_ratings')
    .delete()
    .not('id', 'is', null);

  if (deleteError) {
    console.error('❌ Erro ao excluir avaliações:', deleteError.message);
    process.exit(1);
  }

  const { count: afterCount, error: countAfterError } = await sb
    .from('satisfaction_ratings')
    .select('*', { count: 'exact', head: true });

  if (countAfterError) {
    console.error('❌ Erro ao contar depois:', countAfterError.message);
    process.exit(1);
  }

  console.log(`✅ Limpeza concluída. Total depois: ${afterCount ?? 0}`);
}

main().catch((err) => {
  console.error('❌ Falha inesperada:', err);
  process.exit(1);
});
