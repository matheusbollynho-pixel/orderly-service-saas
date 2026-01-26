import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface SendImagePayload {
  phone: string;
  fileName: string;
  base64: string;
  caption?: string;
  mimeType?: string;
}

serve(async (req) => {
  // Responder a preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload = (await req.json()) as SendImagePayload;

    const apiToken = Deno.env.get("API_BRASIL_TOKEN");
    if (!apiToken) {
      return new Response(
        JSON.stringify({ error: "API_BRASIL_TOKEN não configurado" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Validar campos obrigatórios
    if (!payload.phone || !payload.fileName || !payload.base64) {
      return new Response(
        JSON.stringify({
          error: "Campos obrigatórios: phone, fileName, base64",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log(`📸 Enviando imagem WhatsApp para: ${payload.phone}`);

    // Chamar API Brasil para enviar imagem
    const response = await fetch(
      "https://www.apibrasil.com.br/api/v2/whatsapp/sendimage",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          number: payload.phone,
          caption: payload.caption || "OS Bandara",
          file_name: payload.fileName,
          file_base64: payload.base64,
          mime_type: payload.mimeType || "image/png",
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("❌ Erro API Brasil:", response.status, data);
      return new Response(JSON.stringify(data), {
        status: response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("✅ Imagem enviada com sucesso:", data);

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("❌ Erro ao enviar imagem:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
