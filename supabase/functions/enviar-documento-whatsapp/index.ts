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

    // Ler configuração do provedor
    const provider = (Deno.env.get('WHATSAPP_PROVIDER') || 'uazapi').toLowerCase();
    const isUazApi = provider === 'uazapi';

    const INSTANCE_ID = isUazApi ? Deno.env.get('UAZAPI_INSTANCE_ID') : Deno.env.get('ZAPI_INSTANCE_ID');
    const ADMIN_TOKEN = isUazApi
      ? (Deno.env.get('UAZAPI_ADMIN_TOKEN') || '')
      : (Deno.env.get('ZAPI_TOKEN') || '');

    if (!INSTANCE_ID) {
      console.error('Segredos da API WhatsApp não configurados no ambiente (INSTANCE_ID ausente)');
      return new Response(JSON.stringify({ error: 'Servidor não configurado' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // Montar URL do provedor
    if (!ADMIN_TOKEN) {
      console.error('Admin Token da API WhatsApp ausente no ambiente');
      return new Response(JSON.stringify({ error: 'Servidor não configurado (admin token ausente)' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
    
    // Determina o endpoint baseado no tipo de conteúdo
    let endpoint = 'send-text'; // Default para mensagens de texto
    
    // Se houver fileUrl, usa send-document/pdf para PDFs
    const isPdf = (payload.fileName || '').toLowerCase().endsWith('.pdf') || !!payload.fileBase64;
    if (payload.fileUrl || payload.fileBase64) {
      endpoint = isPdf ? 'send-document/pdf' : 'send-document';
    }
    
    const defaultBase = isUazApi ? 'https://api.uazapi.dev' : 'https://api.z-api.io';
    const baseUrl = (Deno.env.get('WHATSAPP_BASE_URL') || defaultBase).replace(/\/$/, '');
    const textPathTemplate = Deno.env.get('WHATSAPP_TEXT_PATH') || '/instances/{instanceId}/token/{token}/send-text';
    const documentPathTemplate = Deno.env.get('WHATSAPP_DOCUMENT_PATH') || '/instances/{instanceId}/token/{token}/send-document';
    const documentPdfPathTemplate = Deno.env.get('WHATSAPP_DOCUMENT_PDF_PATH') || '/instances/{instanceId}/token/{token}/send-document/pdf';

    const pathTemplate = endpoint === 'send-text'
      ? textPathTemplate
      : endpoint === 'send-document/pdf'
        ? documentPdfPathTemplate
        : documentPathTemplate;

    const path = pathTemplate
      .replace('{instanceId}', encodeURIComponent(INSTANCE_ID))
      .replace('{token}', encodeURIComponent(ADMIN_TOKEN));

    const url = `${baseUrl}${path}`;

    // Montar payload conforme o provedor (campos customizáveis por env)
    const phoneField = Deno.env.get('WHATSAPP_PHONE_FIELD') || 'phone';
    const messageField = Deno.env.get('WHATSAPP_MESSAGE_FIELD') || 'message';
    const documentField = Deno.env.get('WHATSAPP_DOCUMENT_FIELD') || 'document';
    const fileNameField = Deno.env.get('WHATSAPP_FILENAME_FIELD') || 'fileName';
    const captionField = Deno.env.get('WHATSAPP_CAPTION_FIELD') || 'caption';

    const zapiBody: Record<string, unknown> = {
      [phoneField]: payload.to,
    };
    
    const safeFileName = (payload.fileName || 'documento.pdf')
      .replace(/[\s]+/g, '_')
      .replace(/[^a-zA-Z0-9_.-]/g, '');

    if (payload.fileBase64) {
      // Para enviar documento via Z-API em base64
      const base64 = payload.fileBase64.startsWith('data:')
        ? payload.fileBase64
        : `data:application/pdf;base64,${payload.fileBase64}`;
      zapiBody[documentField] = base64;
      zapiBody[fileNameField] = safeFileName || 'documento.pdf';
      if (payload.caption) zapiBody[captionField] = payload.caption;
    } else if (payload.fileUrl) {
      // Para enviar documento por URL
      zapiBody[documentField] = payload.fileUrl;
      const fileNameFromUrl = payload.fileUrl.split('?')[0].split('/').pop();
      zapiBody[fileNameField] = safeFileName || fileNameFromUrl || 'documento.pdf';
      if (payload.caption) zapiBody[captionField] = payload.caption;
    } else if (payload.message) {
      // Para enviar apenas texto
      zapiBody[messageField] = payload.message;
    }

    const zHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Para UazAPI, adicionar Admin-Token no header
    if (isUazApi && ADMIN_TOKEN) {
      zHeaders['Admin-Token'] = ADMIN_TOKEN;
    }

    const authType = (Deno.env.get('WHATSAPP_AUTH_TYPE') || 'none').toLowerCase(); // none|bearer|header
    const authHeader = Deno.env.get('WHATSAPP_AUTH_HEADER') || 'Authorization';
    if (authType === 'bearer' && ADMIN_TOKEN) {
      zHeaders[authHeader] = `Bearer ${ADMIN_TOKEN}`;
    } else if (authType === 'header' && ADMIN_TOKEN) {
      zHeaders[authHeader] = ADMIN_TOKEN;
    }

    // Timeout para a requisição à Z-API
    const controller = new AbortController();
    const timeoutMs = 30000; // 30s (UazAPI pode ser lenta)
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    console.log('🚀 Chamando UazAPI em:', url);
    const startTime = Date.now();

    let zresp: Response;
    try {
      zresp = await fetch(url, {
        method: 'POST',
        headers: zHeaders,
        body: JSON.stringify(zapiBody),
        signal: controller.signal,
      });
      const duration = Date.now() - startTime;
      console.log(`✅ UazAPI respondeu em ${duration}ms`);
    } catch (err: any) {
      clearTimeout(timeout);
      const duration = Date.now() - startTime;
      if (err.name === 'AbortError') {
        console.error(`❌ Timeout na UazAPI após ${duration}ms`);
        return new Response(JSON.stringify({ error: 'Tempo esgotado na requisição à API WhatsApp' }), {
          status: 504,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
      console.error('Falha ao chamar API WhatsApp:', err);
      return new Response(JSON.stringify({ error: 'Falha na chamada à API WhatsApp' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    } finally {
      clearTimeout(timeout);
    }

    const text = await zresp.text().catch(() => '');
    let zJson: any = null;
    try { zJson = JSON.parse(text); } catch { zJson = { raw: text }; }

    console.log('WhatsApp API response:', { status: zresp.status, body: zJson });

    if (!zresp.ok) {
      console.error('API WhatsApp retornou erro', { status: zresp.status, body: zJson });
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Erro da API WhatsApp', 
        z_api_status: zresp.status, 
        z_api_error: zJson 
      }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // Se chegou aqui, sucesso
    return new Response(JSON.stringify({ success: true, zapi: zJson }), {
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
