-- ============================================================
-- Helper pra checagem de saude do sistema: cron.job_run_details não é
-- visível via PostgREST normalmente (schema cron não exposto), então
-- expomos uma função SECURITY DEFINER estreita só pra ler falhas
-- recentes. Usada pelo cron diário de alerta e pelo painel do SuperAdmin.
-- ============================================================

-- return_message pode conter trechos do comando (às vezes com token/JWT
-- embutido no cron), então só service_role e saas_admin podem chamar.
CREATE OR REPLACE FUNCTION public.get_failed_cron_runs(since timestamptz)
RETURNS TABLE(jobname text, status text, start_time timestamptz, return_message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
BEGIN
  IF auth.role() = 'authenticated' AND NOT is_saas_admin() THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  RETURN QUERY
  SELECT j.jobname, d.status, d.start_time, d.return_message
  FROM cron.job_run_details d
  JOIN cron.job j ON j.jobid = d.jobid
  WHERE d.start_time >= since AND d.status = 'failed'
  ORDER BY d.start_time DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_failed_cron_runs(timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_failed_cron_runs(timestamptz) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- Relatório diário de saúde do sistema (cron quebrado + falhas de WhatsApp
-- por loja nas últimas 24h) pro dono, às 9h BRT (12h UTC).
select cron.schedule(
  'system-health-check-daily',
  '0 12 * * *',
  $$
  SELECT net.http_post(
    url := 'https://xqndblstrblqleraepzs.supabase.co/functions/v1/system-health-check',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxbmRibHN0cmJscWxlcmFlcHpzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcxOTE2NDM5MiwiZXhwIjoyMDM0NzQwMzkyfQ.9WuSHaSiMwPFvxXIhQC5TnxGMFdKB8u4h7PNmv4B8QA',
      'Content-Type', 'application/json'
    ),
    body := '{}'::text,
    timeout_milliseconds := 20000
  ) as request_id;
  $$
);
