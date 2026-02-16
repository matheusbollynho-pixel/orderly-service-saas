import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ZAPI_INSTANCE_ID = Deno.env.get("ZAPI_INSTANCE_ID")!;
const ZAPI_CLIENT_TOKEN = Deno.env.get("ZAPI_CLIENT_TOKEN")!;
const ZAPI_TOKEN = Deno.env.get("ZAPI_TOKEN")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function sendWhatsAppMessage(phone: string, message: string): Promise<boolean> {
  try {
    const url = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/send-text`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Client-Token": ZAPI_CLIENT_TOKEN,
      },
      body: JSON.stringify({
        phone: phone,
        message,
      }),
    });

    return response.ok;
  } catch (error) {
    console.error("Erro ao enviar WhatsApp:", error);
    return false;
  }
}

async function checkAndSendReminders() {
  try {
    console.log("🔍 Verificando lembretes de manutenção vencidos...");

    // Find reminders that are due and haven't been sent
    const { data: dueReminders, error: fetchError } = await supabase
      .from("maintenance_reminders")
      .select(`
        id,
        keyword_id,
        client_phone,
        client_id,
        service_date,
        reminder_due_date,
        keyword:maintenance_keywords(keyword, reminder_message)
      `)
      .is("reminder_sent_at", null)
      .lte("reminder_due_date", new Date().toISOString())
      .limit(100);

    if (fetchError) {
      console.error("Erro ao buscar lembretes:", fetchError);
      return;
    }

    if (!dueReminders || dueReminders.length === 0) {
      console.log("✅ Nenhum lembrete vencido no momento");
      return;
    }

    console.log(`📬 Encontrados ${dueReminders.length} lembretes para enviar`);

    let sentCount = 0;
    let errorCount = 0;

    const seen = new Set<string>();

    for (const reminder of dueReminders) {
      try {
        const phone = reminder.client_phone?.replace(/\D/g, "");
        if (!phone || phone.length < 10) {
          console.warn(`⚠️ Telefone inválido para cliente ${reminder.client_id}`);
          errorCount++;
          continue;
        }

        const fullPhone = phone.startsWith("55") ? phone : `55${phone}`;
        const dedupeKey = `${fullPhone}|${reminder.keyword_id || 'unknown'}`;
        if (seen.has(dedupeKey)) {
          const { error: skipError } = await supabase
            .from("maintenance_reminders")
            .update({ reminder_sent_at: new Date().toISOString() })
            .eq("id", reminder.id);

          if (skipError) {
            console.error(`Erro ao marcar duplicado ${reminder.id}:`, skipError);
            errorCount++;
          } else {
            console.log(`⏭️ Duplicado ignorado: ${reminder.id}`);
          }
          continue;
        }
        seen.add(dedupeKey);
        const serviceDate = new Date(reminder.service_date);
        const daysAgo = Math.floor(
          (new Date().getTime() - serviceDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        // Format the message
        const template = reminder.keyword?.reminder_message || "Olá! Já se passaram {days} dias desde o seu {keyword}. Está no prazo para manutenção. 🛠️";
        let message = template;
        message = message.replace("{days}", String(daysAgo));
        message = message.replace("{keyword}", reminder.keyword?.keyword || "serviço");

        console.log(`📱 Enviando para ${fullPhone}...`);
        const sent = await sendWhatsAppMessage(fullPhone, message);

        if (sent) {
          // Update reminder as sent
          const { error: updateError } = await supabase
            .from("maintenance_reminders")
            .update({ reminder_sent_at: new Date().toISOString() })
            .eq("id", reminder.id);

          if (updateError) {
            console.error(`Erro ao atualizar reminder ${reminder.id}:`, updateError);
            errorCount++;
          } else {
            sentCount++;
            console.log(`✅ Lembrete enviado: ${reminder.id}`);
          }
        } else {
          errorCount++;
          console.error(`❌ Falha ao enviar para ${fullPhone}`);
        }
      } catch (error) {
        console.error("Erro processando lembrete:", error);
        errorCount++;
      }
    }

    console.log(
      `\n✅ Envio concluído! Enviados: ${sentCount}, Erros: ${errorCount}`
    );
  } catch (error) {
    console.error("Erro geral na função:", error);
  }
}

// Handle incoming requests
Deno.serve(async (req) => {
  // Only allow POST requests
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    await checkAndSendReminders();

    return new Response(
      JSON.stringify({
        success: true,
        message: "Verificação de lembretes concluída",
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Erro:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});
