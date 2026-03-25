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
    await sql`
      CREATE TABLE IF NOT EXISTS fiados (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        origin_type TEXT NOT NULL DEFAULT 'manual' CHECK (origin_type IN ('os', 'balcao', 'manual')),
        origin_id TEXT,
        client_name TEXT NOT NULL,
        client_phone TEXT,
        client_cpf TEXT,
        client_id UUID,
        items JSONB DEFAULT '[]',
        original_amount NUMERIC NOT NULL DEFAULT 0,
        amount_paid NUMERIC NOT NULL DEFAULT 0,
        interest_accrued NUMERIC NOT NULL DEFAULT 0,
        due_date DATE NOT NULL,
        interest_rate_monthly NUMERIC NOT NULL DEFAULT 2.0,
        status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'parcial', 'pago', 'juridico')),
        last_reminder_level INTEGER DEFAULT 0,
        last_reminder_at TIMESTAMPTZ,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `

    await sql`
      CREATE TABLE IF NOT EXISTS fiado_payments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        fiado_id UUID NOT NULL REFERENCES fiados(id) ON DELETE CASCADE,
        amount NUMERIC NOT NULL,
        method TEXT DEFAULT 'dinheiro',
        notes TEXT,
        received_by TEXT,
        paid_at TIMESTAMPTZ DEFAULT NOW()
      )
    `

    await sql`
      CREATE TABLE IF NOT EXISTS fiado_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        fiado_id UUID NOT NULL REFERENCES fiados(id) ON DELETE CASCADE,
        level INTEGER NOT NULL,
        message TEXT NOT NULL,
        sent_at TIMESTAMPTZ DEFAULT NOW(),
        status TEXT DEFAULT 'sent'
      )
    `

    await sql`ALTER TABLE fiados ENABLE ROW LEVEL SECURITY`
    await sql`ALTER TABLE fiado_payments ENABLE ROW LEVEL SECURITY`
    await sql`ALTER TABLE fiado_messages ENABLE ROW LEVEL SECURITY`

    await sql`
      DO $pol$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'fiados_all' AND tablename = 'fiados') THEN
          CREATE POLICY "fiados_all" ON fiados FOR ALL USING (true) WITH CHECK (true);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'fiado_payments_all' AND tablename = 'fiado_payments') THEN
          CREATE POLICY "fiado_payments_all" ON fiado_payments FOR ALL USING (true) WITH CHECK (true);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'fiado_messages_all' AND tablename = 'fiado_messages') THEN
          CREATE POLICY "fiado_messages_all" ON fiado_messages FOR ALL USING (true) WITH CHECK (true);
        END IF;
      END $pol$
    `

    await sql.end()
    return new Response(JSON.stringify({ ok: true, msg: 'Tables created successfully' }), { headers: CORS })
  } catch (e) {
    await sql.end().catch(() => null)
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: CORS })
  }
})
