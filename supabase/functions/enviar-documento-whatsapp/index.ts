// Removed ts-nocheck directive
// supabase/functions/enviar-documento-whatsapp/index.ts
// Edge Function para enviar mensagem ou documento PDF via provedor de WhatsApp (Z-API/UazAPI)
// Atualizado: 23/01/2026 - Suporte a envio de documentos PDF

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface RequestBody {
  to: string;           // número destino, ex: "5511999999999"
  message?: string;     // texto da mensagem (opcional se enviar documento)
  fileUrl?: string;     // URL pública do arquivo (opcional)
  fileBase64?: string;  // PDF em base64 (opcional)
  fileName?: string;    // nome do arquivo (opcional)
  caption?: string;     // legenda para o documento (opcional)
  store_id?: string;    // ID da loja para usar credenciais próprias
}

type AttemptResult = {
  url: string;
  status: number;
  body: Record<string, unknown> | string | null;
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

    // ── Resolve credenciais WhatsApp ──────────────────────────────────────────
    let INSTANCE_TOKEN: string | undefined;
    let baseUrl: string;

    if (payload.store_id) {
      // Busca credenciais da loja do cliente
      const sb = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      );
      const { data: store } = await sb
        .from('store_settings')
        .select('whatsapp_instance_url, whatsapp_instance_token')
        .eq('id', payload.store_id)
        .maybeSingle();

      if (!store?.whatsapp_instance_token) {
        console.warn('⚠️ Loja sem WhatsApp configurado:', payload.store_id);
        return new Response(JSON.stringify({ success: false, error: 'WhatsApp não configurado para esta loja' }), {
          status: 200, // retorna 200 para não quebrar o fluxo
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
      INSTANCE_TOKEN = store.whatsapp_instance_token;
      baseUrl = store.whatsapp_instance_url || 'https://bandara.uazapi.com';
    } else {
      // Uso interno (funções de sistema) — usa env
      INSTANCE_TOKEN = Deno.env.get('UAZAPI_INSTANCE_TOKEN');
      baseUrl = Deno.env.get('UAZAPI_BASE_URL') || 'https://bandara.uazapi.com';
    }

    if (!INSTANCE_TOKEN) {
      return new Response(JSON.stringify({ error: 'Token WhatsApp não configurado' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    console.log(`📋 Provider: UazAPI, baseUrl: ${baseUrl}, Token: ${INSTANCE_TOKEN.substring(0, 8)}...`);

    // Determina tipo do envio
    const isTextOnly = !!payload.message && !payload.fileUrl && !payload.fileBase64;

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

    const requestBody: Record<string, unknown> = {
      number: payload.to,
    };

    if (payload.fileUrl) {
      // Para /send/media: enviar URL pública como JSON
      requestBody.type = 'document';
      requestBody.file = payload.fileUrl;
      requestBody.text = payload.caption || 'Documento';
      const fileNameFromUrl = payload.fileUrl.split('?')[0].split('/').pop();
      requestBody.docName = safeFileName || fileNameFromUrl || 'documento.pdf';
    } else if (payload.fileBase64) {
      // Fallback: base64 (pode não funcionar em todos os providers)
      let base64 = payload.fileBase64;
      if (base64.startsWith('data:')) {
        base64 = base64.split(',')[1];
      }
      requestBody.type = 'document';
      requestBody.file = base64;
      requestBody.docName = safeFileName;
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
    } catch (err: unknown) {
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
    let parsed: Record<string, unknown> | string | null = null;
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
