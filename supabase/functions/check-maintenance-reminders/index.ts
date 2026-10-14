import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.0";
import { sendWhatsAppText, type StoreWhatsAppConfig } from "../_shared/whatsapp.ts";
import { criarRitmo, dentroDoHorarioComercial, emSegundoPlano, MAX_POR_RODADA } from "../_shared/ritmo.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// Loja "dona" da instância global compartilhada (legado, pré multi-tenant).
const LEGACY_DEFAULT_STORE_ID = '9fd27114-97d1-48cd-ad09-1b057fa9c185';

// Ritmo (pausa, teto por rodada, horário) em _shared/ritmo.ts
const MAX_TENTATIVAS = 3;
const ERROS_SEM_RETRY = /not on whatsapp|invalid.*number|número.*inválido/i;

async function processarLoja(storeId: string, companyName: string, wppConfig: StoreWhatsAppConfig, ritmo: ReturnType<typeof criarRitmo>) {
  if (!wppConfig.instance_url && storeId !== LEGACY_DEFAULT_STORE_ID) {
    console.log(`⏭️ Loja ${companyName} sem WhatsApp configurado — pulando lembretes de manutenção`);
    return { store_id: storeId, enviados: 0, erros: 0 };
  }
  const { data: dueReminders, error } = await supabase
    .from("maintenance_reminders")
    .select(`
      id, keyword_id, client_phone, client_id, service_date, reminder_due_date, reminder_attempts,
      keyword:maintenance_keywords(keyword, reminder_message)
    `)
    .eq("store_id", storeId)
    .is("reminder_sent_at", null)
    .lt("reminder_attempts", MAX_TENTATIVAS)
    .lte("reminder_due_date", new Date().toISOString())
    .order("reminder_due_date", { ascending: true })
    .limit(MAX_POR_RODADA * 3);

  if (error || !dueReminders?.length) return { store_id: storeId, enviados: 0, erros: 0 };

  const seen = new Set<string>();
  let enviados = 0;
  let erros = 0;

  for (const reminder of dueReminders) {
    if (enviados >= MAX_POR_RODADA) break;
    try {
      const phone = reminder.client_phone?.replace(/\D/g, "");
      if (!phone || phone.length < 10 || phone.length > 13) {
        await supabase.from("maintenance_reminders")
          .update({ reminder_sent_at: new Date().toISOString(), reminder_last_error: "Telefone inválido/ausente" })
          .eq("id", reminder.id);
        erros++;
        continue;
      }

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

      // O resto fica pendente e sai na próxima rodada
      if (!(await ritmo.podeEnviar())) break;
      await sendWhatsAppText(fullPhone, message, wppConfig, { storeId, feature: 'lembrete_manutencao' });

      await supabase.from("maintenance_reminders")
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq("id", reminder.id);

      enviados++;
      console.log(`✅ [${companyName}] Lembrete enviado: ${reminder.id}`);
    } catch (e) {
      const errorMsg = String(e);
      const tentativas = (reminder.reminder_attempts || 0) + 1;
      const desistir = ERROS_SEM_RETRY.test(errorMsg) || tentativas >= MAX_TENTATIVAS;
      console.error(`❌ [${companyName}] Erro no lembrete ${reminder.id} (tentativa ${tentativas}):`, e);
      await supabase.from("maintenance_reminders")
        .update({
          reminder_attempts: tentativas,
          reminder_last_error: errorMsg.slice(0, 500),
          ...(desistir ? { reminder_sent_at: new Date().toISOString() } : {}),
        })
        .eq("id", reminder.id);
      erros++;
    }
  }

  return { store_id: storeId, company: companyName, enviados, erros };
}

async function rodada() {
  const { data: stores, error } = await supabase
    .from("store_settings")
    .select("id, company_name, whatsapp_provider, whatsapp_instance_url, whatsapp_instance_token, whatsapp_bulk_paused")
    .eq("active", true);
  if (error) throw error;

  const ritmo = criarRitmo();
  const results = [];
  for (const store of stores || []) {
    if (store.whatsapp_bulk_paused) {
      console.log(`⏸️ Loja ${store.company_name} com envios em massa pausados manualmente — pulando`);
      results.push({ store_id: store.id, enviados: 0, erros: 0 });
      continue;
    }
    const wppConfig: StoreWhatsAppConfig = {
      provider: store.whatsapp_provider || undefined,
      instance_url: store.whatsapp_instance_url || undefined,
      instance_token: store.whatsapp_instance_token || undefined,
    };
    const result = await processarLoja(store.id, store.company_name || "Oficina", wppConfig, ritmo);
    results.push(result);
  }

  const totalEnviados = results.reduce((s, r) => s + r.enviados, 0);
  console.log(`📊 Total: ${totalEnviados} lembretes em ${results.length} loja(s)`);
}

Deno.serve((req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  // Cron roda de hora em hora, inclusive de madrugada: fora do horário não manda.
  if (!dentroDoHorarioComercial()) {
    return new Response(JSON.stringify({ ok: true, fora_do_horario: true }), { headers: { "Content-Type": "application/json" } });
  }
  return emSegundoPlano("check-maintenance-reminders", rodada);
});
