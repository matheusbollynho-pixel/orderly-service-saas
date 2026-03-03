// @ts-nocheck
// supabase/functions/enviar-documento-whatsapp/index.ts
// Edge Function para enviar mensagem ou documento PDF via provedor de WhatsApp (Z-API/UazAPI)
// Atualizado: 23/01/2026 - Suporte a envio de documentos PDF

interface RequestBody {
  to: string;           // número destino, ex: "5511999999999"
  message?: string;     // texto da mensagem (opcional se enviar documento)
  fileUrl?: string;     // URL pública do arquivo (opcional)
  fileBase64?: string;  // PDF em base64 (opcional)
  fileName?: string;    // nome do arquivo (opcional)
  caption?: string;     // legenda para o documento (opcional)
}

type AttemptResult = {
  url: string;
  status: number;
  body: any;
  headerType: string;
};

console.info('enviar-documento-whatsapp function iniciada');

const allowedOrigin = Deno.env.get('CORS_ALLOWED_ORIGIN') ?? '*';
const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

Deno.serve(async (req: Request) => {
  try {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Método não permitido' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    console.log('✅ Requisição POST recebida');

    // Parse do corpo JSON
    const payload: RequestBody | null = await req.json().catch(() => null);
    if (!payload || !payload.to || (!payload.message && !payload.fileUrl && !payload.fileBase64)) {
      return new Response(JSON.stringify({ error: 'Corpo inválido. Campos requeridos: to e (message ou fileUrl ou fileBase64)' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    console.log('✅ Payload válido para:', payload.to);

    // ✅ Provider: UazAPI apenas
    const INSTANCE_TOKEN = Deno.env.get('UAZAPI_INSTANCE_TOKEN');

    console.log(`📋 Provider: UazAPI, Token: ${INSTANCE_TOKEN?.substring(0, 8)}...`);

    if (!INSTANCE_TOKEN) {
      console.error('❌ INSTANCE_TOKEN não configurado no ambiente');
      return new Response(JSON.stringify({ error: 'Servidor não configurado (INSTANCE_TOKEN ausente)' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
    
    // Determina tipo do envio
    const isTextOnly = !!payload.message && !payload.fileUrl && !payload.fileBase64;

    // ✅ UazAPI: Configuração fixa conforme painel
    const baseUrl = 'https://bandara.uazapi.com';
    const endpointPath = isTextOnly ? '/send/text' : '/send/media';
    const finalUrl = `${baseUrl}${endpointPath}`;

    const safeFileName = (payload.fileName || 'documento.pdf')
      .replace(/[\s]+/g, '_')
      .replace(/[^a-zA-Z0-9_.-]/g, '');

    // Header conforme painel UazAPI
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      token: INSTANCE_TOKEN,
    };

    let requestBody: Record<string, unknown> = {
      number: payload.to,
    };

    if (payload.fileUrl) {
      // Para /send/media: enviar URL pública como JSON
      requestBody.file = payload.fileUrl;
      requestBody.text = payload.caption || 'Documento';
      const fileNameFromUrl = payload.fileUrl.split('?')[0].split('/').pop();
      requestBody.fileName = safeFileName || fileNameFromUrl || 'documento.pdf';
    } else if (payload.fileBase64) {
      // Fallback: base64 (pode não funcionar em todos os providers)
      let base64 = payload.fileBase64;
      if (base64.startsWith('data:')) {
        base64 = base64.split(',')[1];
      }
      requestBody.file = base64;
      requestBody.fileName = safeFileName;
      requestBody.text = payload.caption || 'Documento';
    } else if (payload.message) {
      // Para /send/text: usar JSON com text
      requestBody.text = payload.message;
    }

    console.log(`🚀 UazAPI ${endpointPath}:`, { number: requestBody.number, hasFile: !!requestBody.file, hasText: !!requestBody.text });
    console.log('📤 Request body:', JSON.stringify(requestBody, null, 2));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    let resp: Response;
    try {
      resp = await fetch(finalUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
    } catch (err: any) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        return new Response(JSON.stringify({ error: 'Tempo esgotado na requisição à UazAPI' }), {
          status: 504,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
      return new Response(JSON.stringify({ error: 'Falha ao chamar UazAPI', detail: String(err) }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    } finally {
      clearTimeout(timeout);
    }

    const raw = await resp.text().catch(() => '');
    let parsed: any = null;
    try { parsed = JSON.parse(raw); } catch { parsed = { raw }; }

    console.log(`📥 UazAPI response status: ${resp.status}`);
    console.log(`📥 UazAPI response body:`, JSON.stringify(parsed, null, 2));

    if (!resp.ok) {
      const hint = resp.status === 401
        ? 'Token inválido. Configure UAZAPI_INSTANCE_TOKEN com o token da instância (não o admin token).'
        : resp.status === 405
          ? 'Rota inválida para sua instância. Verifique WHATSAPP_TEXT_PATH e base URL.'
          : 'Erro da API WhatsApp';

      return new Response(JSON.stringify({
        success: false,
        error: hint,
        z_api_status: resp.status,
        z_api_error: parsed,
        used: { url: finalUrl, authHeader: 'token' },
      }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // Se chegou aqui, sucesso
    return new Response(JSON.stringify({ success: true, zapi: parsed, used: { url: finalUrl, authHeader: 'token' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });

  } catch (err) {
    console.error('Erro não tratado na função:', err);
    return new Response(JSON.stringify({ error: 'Erro interno do servidor' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
});
