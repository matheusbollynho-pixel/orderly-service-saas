-- Verificar se há trigger de UPDATE duplicando
SELECT 
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement
FROM information_schema.triggers
WHERE event_object_table = 'payments'
ORDER BY trigger_name, event_manipulation;
