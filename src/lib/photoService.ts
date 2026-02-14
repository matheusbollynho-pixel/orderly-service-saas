import { supabase } from '@/integrations/supabase/client';

export async function uploadChecklistPhoto(
  file: File,
  orderId: string,
  checklistItemId: string
): Promise<{ url: string; path: string } | null> {
  try {
    const timestamp = Date.now();
    const fileName = `${orderId}/${checklistItemId}/${timestamp}-${file.name}`;
    const storagePath = `checklist-photos/${fileName}`;

    const { data, error } = await supabase.storage
      .from('checklist-photos')
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      console.error('Erro ao upload de foto:', error);
      return null;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from('checklist-photos').getPublicUrl(storagePath);

    // Registrar foto no banco para limpeza automática
    const { error: insertError } = await supabase.from('checklist_photos').insert({
      checklist_item_id: checklistItemId,
      order_id: orderId,
      photo_url: publicUrl,
      storage_path: storagePath,
    });

    if (insertError) {
      console.warn('Aviso ao registrar foto:', insertError);
    }

    return { url: publicUrl, path: storagePath };
  } catch (err) {
    console.error('Erro ao fazer upload:', err);
    return null;
  }
}

export async function deleteChecklistPhoto(storagePath: string): Promise<boolean> {
  try {
    const { error } = await supabase.storage
      .from('checklist-photos')
      .remove([storagePath]);

    if (error) {
      console.error('Erro ao deletar foto:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Erro ao deletar:', err);
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
    console.error('Erro ao buscar fotos:', err);
    return [];
  }
}

export async function deleteOldPhotos(daysThreshold: number = 100): Promise<number> {
  try {
    const threshold = new Date(Date.now() - daysThreshold * 24 * 60 * 60 * 1000);

    const { data: oldPhotos, error: selectError } = await supabase
      .from('checklist_photos')
      .select('id, storage_path')
      .lt('uploaded_at', threshold.toISOString());

    if (selectError) throw selectError;

    if (!oldPhotos || oldPhotos.length === 0) {
      console.log('Nenhuma foto antiga para deletar');
      return 0;
    }

    const storagePaths = oldPhotos.map((p) => p.storage_path);

    if (storagePaths.length > 0) {
      const { error: deleteStorageError } = await supabase.storage
        .from('checklist-photos')
        .remove(storagePaths);

      if (deleteStorageError) {
        console.error('Erro ao deletar fotos do storage:', deleteStorageError);
      }
    }

    const photoIds = oldPhotos.map((p) => p.id);
    const { error: deleteDbError } = await supabase
      .from('checklist_photos')
      .delete()
      .in('id', photoIds);

    if (deleteDbError) throw deleteDbError;

    console.log(`${photoIds.length} fotos antigas deletadas`);
    return photoIds.length;
  } catch (err) {
    console.error('Erro ao deletar fotos antigas:', err);
    return 0;
  }
}
