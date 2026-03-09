-- Add satisfaction survey control field
ALTER TABLE public.service_orders 
ADD COLUMN IF NOT EXISTS satisfaction_survey_sent_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_satisfaction_survey_sent 
ON public.service_orders(satisfaction_survey_sent_at) 
WHERE satisfaction_survey_sent_at IS NULL;

-- Add comment
COMMENT ON COLUMN public.service_orders.satisfaction_survey_sent_at IS 'Data/hora em que a pesquisa de satisfação foi enviada';
