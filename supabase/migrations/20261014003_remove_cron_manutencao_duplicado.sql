-- check-maintenance-reminders estava agendado 2x: o diário antigo
-- (202602170100, sem auth) e o de hora em hora. Mantém só o de hora em hora.
select cron.unschedule('check_maintenance_reminders_daily');
