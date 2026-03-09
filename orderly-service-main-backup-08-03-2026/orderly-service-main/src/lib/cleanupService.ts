import { supabase } from '../integrations/supabase/client';

/**
 * Função para limpar fotos de checklist com mais de 100 dias
 * Como o plano Free do Supabase não inclui pg_cron, esta função
 * é chamada periodicamente pela aplicação
 */
export async function cleanupOldChecklistPhotos() {
  try {
    // Buscar todas as fotos com mais de 100 dias
    const hundredDaysAgo = new Date();
    hundredDaysAgo.setDate(hundredDaysAgo.getDate() - 100);

    const { data: oldPhotos, error: queryError } = await supabase
      .from('checklist_photos')
      .select('id, storage_path')
      .lt('uploaded_at', hundredDaysAgo.toISOString());

    if (queryError) {
      console.error('Erro ao buscar fotos antigas:', queryError);
      return;
    }

    if (!oldPhotos || oldPhotos.length === 0) {
      console.log('Nenhuma foto para limpar');
      return;
    }

    console.log(`Limpando ${oldPhotos.length} fotos antigas...`);

    // Deletar fotos do Storage
    for (const photo of oldPhotos) {
      if (photo.storage_path) {
        try {
          await supabase.storage
            .from('checklist-photos')
            .remove([photo.storage_path]);
        } catch (error) {
          console.error(`Erro ao deletar arquivo ${photo.storage_path}:`, error);
        }
      }
    }

    // Deletar registros do banco de dados
    const photoIds = oldPhotos.map(p => p.id);
    const { error: deleteError } = await supabase
      .from('checklist_photos')
      .delete()
      .in('id', photoIds);

    if (deleteError) {
      console.error('Erro ao deletar registros de fotos:', deleteError);
    } else {
      console.log(`✅ ${photoIds.length} fotos deletadas com sucesso`);
    }
  } catch (error) {
    console.error('Erro no processo de limpeza:', error);
  }
}
