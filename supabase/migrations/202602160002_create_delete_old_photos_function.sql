-- Criar função de limpeza de fotos antigas
CREATE OR REPLACE FUNCTION public.delete_old_checklist_photos()
RETURNS TABLE(deleted_count INT) AS $$
DECLARE
  v_deleted INT := 0;
  v_threshold TIMESTAMPTZ;
  v_storage_paths TEXT[];
BEGIN
  v_threshold := NOW() - INTERVAL '100 days';
  
  -- Obter caminhos do storage das fotos que serão deletadas
  SELECT ARRAY_AGG(storage_path) INTO v_storage_paths
  FROM public.checklist_photos
  WHERE uploaded_at < v_threshold;
  
  -- Deletar do storage se houver arquivos
  -- (Nota: Supabase não permite deletar do storage via SQL diretamente, 
  -- será necessário chamar via API ou função de borda)
  
  -- Deletar registros do banco
  DELETE FROM public.checklist_photos
  WHERE uploaded_at < v_threshold;
  
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  
  RETURN QUERY SELECT v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Dar permissão de execução
GRANT EXECUTE ON FUNCTION public.delete_old_checklist_photos() TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_old_checklist_photos() TO anon;

COMMENT ON FUNCTION public.delete_old_checklist_photos() IS 'Deleta fotos do checklist com mais de 100 dias';
