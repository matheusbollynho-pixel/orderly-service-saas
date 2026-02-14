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

-- Criar trigger para executar limpeza diariamente (usando pg_cron se disponível no plano pago)
-- Para planos pagos, use:
-- SELECT cron.schedule('delete-old-checklist-photos', '0 0 * * *', 'SELECT delete_old_checklist_photos()');

-- Para planos gratuitos, você pode adicionar lógica no aplicativo para chamar a função periodicamente

-- Comentários
COMMENT ON FUNCTION delete_old_checklist_photos IS 'Deleta fotos do checklist com mais de 100 dias';
