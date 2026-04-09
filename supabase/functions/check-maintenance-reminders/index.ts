import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.0";
import { sendWhatsAppText } from "../_shared/whatsapp.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

async function processarLoja(storeId: string, companyName: string) {
  const { data: dueReminders, error } = await supabase
    .from("maintenance_reminders")
    .select(`
      id, keyword_id, client_phone, client_id, service_date, reminder_due_date,
      keyword:maintenance_keywords(keyword, reminder_message)
    `)
    .eq("store_id", storeId)
    .is("reminder_sent_at", null)
    .lte("reminder_due_date", new Date().toISOString())
    .limit(100);

  if (error || !dueReminders?.length) return { store_id: storeId, enviados: 0, erros: 0 };

  const seen = new Set<string>();
  let enviados = 0;
  let erros = 0;

  for (const reminder of dueReminders) {
    try {
      const phone = reminder.client_phone?.replace(/\D/g, "");
      if (!phone || phone.length < 10) { erros++; continue; }

      const fullPhone = phone.startsWith("55") ? phone : `55${phone}`;
      const dedupeKey = `${fullPhone}|${reminder.keyword_id || 'unknown'}`;

      if (seen.has(dedupeKey)) {
        await supabase.from("maintenance_reminders")
          .update({ reminder_sent_at: new Date().toISOString() })
          .eq("id", reminder.id);
        continue;
      }
      seen.add(dedupeKey);

      const daysAgo = Math.floor(
        (Date.now() - new Date(reminder.service_date).getTime()) / (1000 * 60 * 60 * 24)
      );

      const template = reminder.keyword?.reminder_message ||
        `Olá! Já se passaram {days} dias desde o seu {keyword} na *${companyName}*. Está no prazo para manutenção. 🛠️`;
      const message = template
        .replace("{days}", String(daysAgo))
        .replace("{keyword}", reminder.keyword?.keyword || "serviço");

      await sendWhatsAppText(fullPhone, message);

      await supabase.from("maintenance_reminders")
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq("id", reminder.id);

      enviados++;
      console.log(`✅ [${companyName}] Lembrete enviado: ${reminder.id}`);
    } catch (e) {
      console.error(`❌ [${companyName}] Erro no lembrete ${reminder.id}:`, e);
      erros++;
    }
  }

  return { store_id: storeId, company: companyName, enviados, erros };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  try {
    const { data: stores, error } = await supabase
      .from("store_settings")
      .select("id, company_name")
      .eq("active", true);

    if (error) throw error;

    const results = [];
    for (const store of stores || []) {
      const result = await processarLoja(store.id, store.company_name || "Oficina");
      results.push(result);
    }

    const totalEnviados = results.reduce((s, r) => s + r.enviados, 0);
    console.log(`📊 Total: ${totalEnviados} lembretes em ${results.length} loja(s)`);

    return new Response(JSON.stringify({ success: true, lojas: results.length, enviados: totalEnviados }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Erro geral:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
