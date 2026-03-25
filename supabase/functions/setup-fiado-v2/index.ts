/**
 * setup-fiado-v2
 * Adiciona colunas novas à tabela fiados:
 *   - next_reminder_at  TIMESTAMPTZ  (IA decide quando enviar próxima mensagem)
 *   - asaas_payment_id  TEXT         (ID da cobrança no Asaas)
 *   - asaas_payment_url TEXT         (Link de pagamento Asaas)
 */
import postgres from 'https://deno.land/x/postgresjs@v3.4.4/mod.js'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const dbUrl = Deno.env.get('SUPABASE_DB_URL')
  if (!dbUrl) {
    return new Response(JSON.stringify({ error: 'SUPABASE_DB_URL not set' }), { headers: CORS })
  }

  const sql = postgres(dbUrl, { ssl: 'require' })

  try {
    await sql`ALTER TABLE fiados ADD COLUMN IF NOT EXISTS next_reminder_at TIMESTAMPTZ`
    await sql`ALTER TABLE fiados ADD COLUMN IF NOT EXISTS asaas_payment_id TEXT`
    await sql`ALTER TABLE fiados ADD COLUMN IF NOT EXISTS asaas_payment_url TEXT`

    // Adiciona 'fiado' ao CHECK constraint do status de balcao_orders
    await sql`ALTER TABLE balcao_orders DROP CONSTRAINT IF EXISTS balcao_orders_status_check`
    await sql`ALTER TABLE balcao_orders ADD CONSTRAINT balcao_orders_status_check CHECK (status IN ('aberta', 'finalizada', 'cancelada', 'fiado'))`

    await sql.end()
    return new Response(JSON.stringify({ ok: true, msg: 'Done' }), { headers: CORS })
  } catch (e) {
    await sql.end().catch(() => null)
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: CORS })
  }
})
