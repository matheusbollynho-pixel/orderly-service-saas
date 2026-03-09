-- Função para deletar fotos antigas (100+ dias)
CREATE OR REPLACE FUNCTION delete_old_checklist_photos()
RETURNS TABLE(deleted_count INT) AS $$
DECLARE
  v_deleted INT;
  v_threshold TIMESTAMPTZ;
BEGIN
  v_threshold := NOW() - INTERVAL '100 days';
  
  -- Deletar registros do banco que estão com 100+ dias
  DELETE FROM public.checklist_photos
  WHERE uploaded_at < v_threshold;
  
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  
  RETURN QUERY SELECT v_deleted;
END;
$$ LANGUAGE plpgsql;

-- Dar permissão de execução para usuários autenticados
GRANT EXECUTE ON FUNCTION delete_old_checklist_photos() TO authenticated;

-- Comentários
COMMENT ON FUNCTION delete_old_checklist_photos IS 'Deleta fotos do checklist com mais de 100 dias';

