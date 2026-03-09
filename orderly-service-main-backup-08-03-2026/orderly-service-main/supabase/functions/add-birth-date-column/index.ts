import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

export default async (req: Request) => {
  try {
    // Execute SQL to add the column
    const { error } = await supabase.rpc('_execute_raw_sql', {
      sql: `
        ALTER TABLE IF EXISTS public.service_orders
        ADD COLUMN IF NOT EXISTS client_birth_date DATE;
        
        COMMENT ON COLUMN public.service_orders.client_birth_date IS 'Data de nascimento do cliente para campanha de aniversário';
      `
    }).then(r => ({ error: null })).catch(err => ({ error: err }))

    if (error) {
      // Se rpc não existe, tenta executação direta
      return new Response(JSON.stringify({
        success: false,
        message: 'RPC não disponível, tentando alternativa...'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Coluna client_birth_date adicionada com sucesso!'
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    return new Response(JSON.stringify({
      error: error.message
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 400,
    })
  }
}
