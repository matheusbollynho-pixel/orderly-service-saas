import { supabase } from '@/integrations/supabase/client';

export async function uploadChecklistPhoto(
  file: File,
  orderId: string,
  checklistItemId: string
): Promise<{ url: string; path: string } | null> {
  try {
    const timestamp = Date.now();
    
    // Sanitizar nome - SIMPLES E DIRETO
    let sanitizedName = file.name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove acentos
      .replace(/[^a-zA-Z0-9._-]/g, '_'); // Substitui especiais por _
    
    // Se for HEIC, renomear extensão para .jpg (sem converter, browser faz isso)
    if (sanitizedName.toLowerCase().endsWith('.heic') || sanitizedName.toLowerCase().endsWith('.heif')) {
      sanitizedName = sanitizedName.replace(/\.(heic|heif)$/i, '.jpg');
    }
    
    const fileName = `${orderId}/${checklistItemId}/${timestamp}-${sanitizedName}`;

    console.log('🚀 Upload DIRETO:', fileName, 'Size:', file.size, 'Type:', file.type);

    // Upload DIRETO sem conversão
    const { data, error } = await supabase.storage
      .from('checklist-photos')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      console.error('❌ Erro upload:', error);
      return null;
    }

    console.log('📤 Arquivo salvo em:', data.path);

    const { data: { publicUrl } } = supabase.storage
      .from('checklist-photos')
      .getPublicUrl(data.path);

    console.log('✅ URL gerada:', publicUrl);

    // Salvar no banco
    const { error: insertError } = await supabase.from('checklist_photos').insert({
      checklist_item_id: checklistItemId,
      order_id: orderId,
      photo_url: publicUrl,
      storage_path: data.path,
    });

    if (insertError) {
      console.error('❌ Erro ao salvar no DB:', insertError);
      return null;
    }

    console.log('✅ Salvo no banco de dados');
    return { url: publicUrl, path: data.path };
  } catch (err) {
    console.error('❌ Erro geral:', err);
    return null;
  }
}

export async function deleteChecklistPhoto(storagePath: string): Promise<boolean> {
  try {
    await supabase.storage
      .from('checklist-photos')
      .remove([storagePath]);

    return true;
  } catch (err) {
    console.error('Erro:', err);
    return false;
  }
}

export async function getChecklistPhotos(checklistItemId: string) {
  try {
    const { data, error } = await supabase
      .from('checklist_photos')
      .select('*')
      .eq('checklist_item_id', checklistItemId)
      .order('uploaded_at', { ascending: false });

    if (error) throw error;
    
    return data || [];
  } catch (err) {
    console.error('Erro:', err);
    return [];
  }
}

export async function deleteChecklistPhotos(checklistItemId: string): Promise<boolean> {
  try {
    const photos = await getChecklistPhotos(checklistItemId);
    
    if (photos.length === 0) return true;

    const storagePaths = photos.map(p => p.storage_path).filter(Boolean);

    if (storagePaths.length > 0) {
      await supabase.storage
        .from('checklist-photos')
        .remove(storagePaths);
    }

    await supabase
      .from('checklist_photos')
      .delete()
      .eq('checklist_item_id', checklistItemId);

    return true;
  } catch (err) {
    console.error('Erro:', err);
    return false;
  }
}

export async function cleanupOldPhotos(days: number = 100): Promise<number | null> {
  try {
    console.log(`🧹 Limpando fotos com ${days}+ dias (banco + storage)...`);
    
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - days);
    const thresholdISO = threshold.toISOString();

    // 1. Obter fotos antigas do banco
    const { data: oldPhotos, error: selectError } = await supabase
      .from('checklist_photos')
      .select('id, storage_path')
      .lt('uploaded_at', thresholdISO);

    if (selectError) {
      console.error('❌ Erro ao buscar fotos:', selectError);
      return null;
    }

    if (!oldPhotos || oldPhotos.length === 0) {
      console.log(`✅ Nenhuma foto com ${days}+ dias para deletar`);
      return 0;
    }

    console.log(`📍 Encontradas ${oldPhotos.length} fotos para deletar`);

    // 2. Deletar do Storage
    const storagePaths = oldPhotos.map(p => p.storage_path);
    if (storagePaths.length > 0) {
      console.log(`📁 Tentando deletar ${storagePaths.length} arquivos do storage...`);
      console.log('🔍 Paths:', storagePaths);
      
      const { error: storageError } = await supabase.storage
        .from('checklist-photos')
        .remove(storagePaths);

      if (storageError) {
        console.error('❌ Erro ao deletar Storage:', JSON.stringify(storageError));
        // Não retornar aqui - continuar para deletar banco mesmo com erro
      } else {
        console.log(`✅ ${storagePaths.length} arquivos deletados do storage`);
      }
    }

    // 3. Deletar do banco
    const { error: deleteError, data: deletedData } = await supabase
      .from('checklist_photos')
      .delete()
      .lt('uploaded_at', thresholdISO)
      .select('id');

    if (deleteError) {
      console.error('❌ Erro ao deletar banco:', deleteError);
      return null;
    }

    const deletedCount = deletedData?.length || 0;
    console.log(`✅ ${deletedCount} registros deletados do banco`);
    console.log(`✅ Limpeza completa: ${deletedCount} fotos removidas`);
    
    return deletedCount;
  } catch (err) {
    console.error('❌ Erro geral na limpeza:', err);
    return null;
  }
}
