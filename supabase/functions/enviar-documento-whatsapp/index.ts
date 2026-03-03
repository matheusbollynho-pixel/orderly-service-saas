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

    // Checagem de Authorization (temporariamente comentado para debug)
    // const authHeader = req.headers.get('Authorization') || '';
    // const tokenMatch = authHeader.match(/^Bearer (.+)$/);
    // const userToken = tokenMatch ? tokenMatch[1] : null;
    // if (!userToken) {
    //   return new Response(JSON.stringify({ error: 'Header Authorization ausente ou inválido' }), {
    //     status: 401,
    //     headers: { 'Content-Type': 'application/json', ...corsHeaders },
    //   });
    // }

    // Validar JWT chamando o endpoint /auth/v1/user do Supabase (TEMPORARIAMENTE DESABILITADO)
    // const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
    // const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    // if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    //   return new Response(JSON.stringify({ error: 'Configuração do Supabase ausente' }), {
    //     status: 500,
    //     headers: { 'Content-Type': 'application/json', ...corsHeaders },
    //   });
    // }

    // const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    //   method: 'GET',
    //   headers: {
    //     Authorization: `Bearer ${userToken}`,
    //     apikey: SUPABASE_SERVICE_ROLE_KEY,
    //   },
    // });

    // if (!userRes.ok) {
    //   const detail = await userRes.text().catch(() => '');
    //   console.warn('Token inválido ao validar no Supabase', { status: userRes.status, detail });
    //   return new Response(JSON.stringify({ error: 'Token inválido' }), {
    //     status: 401,
    //     headers: { 'Content-Type': 'application/json', ...corsHeaders },
    //   });
    // }

    // Parse do corpo JSON
    const payload: RequestBody | null = await req.json().catch(() => null);
    if (!payload || !payload.to || (!payload.message && !payload.fileUrl && !payload.fileBase64)) {
      return new Response(JSON.stringify({ error: 'Corpo inválido. Campos requeridos: to e (message ou fileUrl ou fileBase64)' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // Ler configuração do provedor
    const provider = (Deno.env.get('WHATSAPP_PROVIDER') || 'zapi').toLowerCase();
    const isUazApi = provider === 'uazapi';

    const INSTANCE_ID = isUazApi ? Deno.env.get('UAZAPI_INSTANCE_ID') : Deno.env.get('ZAPI_INSTANCE_ID');
    const CLIENT_TOKEN = isUazApi
      ? (Deno.env.get('UAZAPI_CLIENT_TOKEN') || '')
      : (Deno.env.get('ZAPI_CLIENT_TOKEN') || '');
    const OPTIONAL_TOKEN = isUazApi ? Deno.env.get('UAZAPI_TOKEN') : Deno.env.get('ZAPI_TOKEN');

    if (!INSTANCE_ID) {
      console.error('Segredos da API WhatsApp não configurados no ambiente (INSTANCE_ID ausente)');
      return new Response(JSON.stringify({ error: 'Servidor não configurado' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // Montar URL do provedor
    const API_TOKEN = OPTIONAL_TOKEN || '';
    if (!API_TOKEN) {
      console.error('Token da API WhatsApp ausente no ambiente');
      return new Response(JSON.stringify({ error: 'Servidor não configurado (token ausente)' }), {
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
      .replace('{token}', encodeURIComponent(API_TOKEN));

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

    if (CLIENT_TOKEN) {
      const clientTokenHeader = Deno.env.get('WHATSAPP_CLIENT_TOKEN_HEADER') || 'Client-Token';
      zHeaders[clientTokenHeader] = CLIENT_TOKEN;
    }

    const authType = (Deno.env.get('WHATSAPP_AUTH_TYPE') || 'none').toLowerCase(); // none|bearer|header
    const authHeader = Deno.env.get('WHATSAPP_AUTH_HEADER') || 'Authorization';
    const authToken = Deno.env.get('WHATSAPP_AUTH_TOKEN') || API_TOKEN;
    if (authType === 'bearer' && authToken) {
      zHeaders[authHeader] = `Bearer ${authToken}`;
    } else if (authType === 'header' && authToken) {
      zHeaders[authHeader] = authToken;
    }

    // Timeout para a requisição à Z-API
    const controller = new AbortController();
    const timeoutMs = 15000; // 15s
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let zresp: Response;
    try {
      zresp = await fetch(url, {
        method: 'POST',
        headers: zHeaders,
        body: JSON.stringify(zapiBody),
        signal: controller.signal,
      });
    } catch (err: any) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
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
