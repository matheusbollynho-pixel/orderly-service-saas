-- Create enum for order status
CREATE TYPE public.order_status AS ENUM ('aberta', 'em_andamento', 'concluida');

-- Create service orders table
CREATE TABLE public.service_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_name TEXT NOT NULL,
  client_phone TEXT NOT NULL,
  client_address TEXT NOT NULL,
  equipment TEXT NOT NULL,
  problem_description TEXT NOT NULL,
  status order_status NOT NULL DEFAULT 'aberta',
  signature_data TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create checklist items table
CREATE TABLE public.checklist_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES public.service_orders(id) ON DELETE CASCADE NOT NULL,
  label TEXT NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.service_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_items ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (no auth required for this simple app)
CREATE POLICY "Allow all operations on service_orders" 
ON public.service_orders 
FOR ALL 
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow all operations on checklist_items" 
ON public.checklist_items 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_service_orders_updated_at
BEFORE UPDATE ON public.service_orders
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for both tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.service_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.checklist_items;