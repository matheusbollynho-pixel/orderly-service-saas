// @ts-nocheck
// supabase/functions/enviar-documento-whatsapp/index.ts
// Edge Function para enviar mensagem ou documento PDF via Z-API
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

    // Ler secrets (disponibilizadas automaticamente no runtime)
    const INSTANCE_ID = Deno.env.get('ZAPI_INSTANCE_ID');
    const CLIENT_TOKEN = Deno.env.get('ZAPI_CLIENT_TOKEN');
    const OPTIONAL_TOKEN = Deno.env.get('ZAPI_TOKEN'); // usado se aplicável

    if (!INSTANCE_ID || !CLIENT_TOKEN) {
      console.error('Segredos da Z-API não configurados no ambiente');
      return new Response(JSON.stringify({ error: 'Servidor não configurado' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // Montar URL da Z-API (endpoint correto conforme documentação oficial)
    const ZAPI_TOKEN = OPTIONAL_TOKEN || '';
    if (!ZAPI_TOKEN) {
      console.error('ZAPI_TOKEN ausente no ambiente');
      return new Response(JSON.stringify({ error: 'Servidor não configurado (ZAPI_TOKEN ausente)' }), {
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
    
    const url = `https://api.z-api.io/instances/${encodeURIComponent(INSTANCE_ID)}/token/${encodeURIComponent(ZAPI_TOKEN)}/${endpoint}`;

    // Montar payload conforme o que a Z-API espera
    const zapiBody: Record<string, unknown> = {
      phone: payload.to,
    };
    
    const safeFileName = (payload.fileName || 'documento.pdf')
      .replace(/[\s]+/g, '_')
      .replace(/[^a-zA-Z0-9_.-]/g, '');

    if (payload.fileBase64) {
      // Para enviar documento via Z-API em base64
      const base64 = payload.fileBase64.startsWith('data:')
        ? payload.fileBase64
        : `data:application/pdf;base64,${payload.fileBase64}`;
      zapiBody['document'] = base64;
      zapiBody['fileName'] = safeFileName || 'documento.pdf';
      if (payload.caption) zapiBody['caption'] = payload.caption;
    } else if (payload.fileUrl) {
      // Para enviar documento via Z-API por URL
      zapiBody['document'] = payload.fileUrl;
      const fileNameFromUrl = payload.fileUrl.split('?')[0].split('/').pop();
      zapiBody['fileName'] = safeFileName || fileNameFromUrl || 'documento.pdf';
      if (payload.caption) zapiBody['caption'] = payload.caption;
    } else if (payload.message) {
      // Para enviar apenas texto
      zapiBody['message'] = payload.message;
    }

    const zHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'Client-Token': CLIENT_TOKEN,
    };

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
        return new Response(JSON.stringify({ error: 'Tempo esgotado na requisição à Z-API' }), {
          status: 504,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
      console.error('Falha ao chamar Z-API:', err);
      return new Response(JSON.stringify({ error: 'Falha na chamada à Z-API' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    } finally {
      clearTimeout(timeout);
    }

    const text = await zresp.text().catch(() => '');
    let zJson: any = null;
    try { zJson = JSON.parse(text); } catch { zJson = { raw: text }; }

    console.log('Z-API response:', { status: zresp.status, body: zJson });

    if (!zresp.ok) {
      console.error('Z-API retornou erro', { status: zresp.status, body: zJson });
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Erro da Z-API', 
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
