// src/services/whatsappService.ts

import { supabase } from '@/integrations/supabase/client';

// Lazy init para evitar quebrar o app se variáveis faltarem em produção
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

function getSupabase() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Configuração do WhatsApp indisponível. Verifique as variáveis VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY.');
  }
  return supabase;
}

function formatPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  // Precisa ter código do país (55) + DDD + número
  if (digits.length < 12) {
    return digits.length >= 10 ? `55${digits}` : null;
  }
  return digits;
}

function sanitizeFileName(fileName: string): string {
  const safe = fileName
    .replace(/[\s]+/g, '_')
    .replace(/[^a-zA-Z0-9_.-]/g, '');
  return safe || 'documento.pdf';
}

async function callEdgeFunction(payload: Record<string, unknown>): Promise<any> {
  const supabase = getSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const token = session?.access_token;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${SUPABASE_URL}/functions/v1/enviar-documento-whatsapp`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let json: any;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }

  if (!res.ok || json?.success === false) {
    const details = json?.z_api_error ? ` | Detalhes: ${JSON.stringify(json.z_api_error)}` : '';
    const statusInfo = json?.z_api_status ? ` | Z-API status: ${json.z_api_status}` : '';
    const msg = (json?.error || json?.message || `Falha na função (status ${res.status})`) + statusInfo + details;
    throw new Error(msg);
  }

  return json;
}

export type SendWhatsAppOptions = {
  to: string;           // ex: "5511999999999"
  message?: string;
  fileUrl?: string;     // URL pública do arquivo (preferível para a Edge Function)
  caption?: string;
};

/**
 * Envia uma requisição para a Edge Function "enviar-documento-whatsapp".
 * Regras:
 * - Deve estar autenticado no Supabase (session.access_token).
 * - O corpo enviado à função contém: to, message?, fileUrl?, caption?
 *
 * Retorna o JSON de resposta da função ou lança erro.
 */
export async function sendWhatsApp(opts: SendWhatsAppOptions) {
  const { to, message, fileUrl, caption } = opts;

  if (!to) throw new Error('Campo "to" é obrigatório');
  if (!message && !fileUrl) throw new Error('É necessário enviar "message" ou "fileUrl"');

  const payload: Record<string, unknown> = { to };
  if (message) payload.message = message;
  if (fileUrl) {
    payload.fileUrl = fileUrl;
    if (caption) payload.caption = caption;
  }

  return callEdgeFunction(payload);
}

export async function sendWhatsAppText(params: { phone: string; text: string }): Promise<boolean> {
  const phone = formatPhone(params.phone);
  if (!phone) throw new Error('Telefone do cliente inválido.');
  if (!params.text?.trim()) throw new Error('Texto da mensagem é obrigatório.');

  const res = await callEdgeFunction({ to: phone, message: params.text });
  return !!res;
}

export async function sendWhatsAppDocument(params: {
  phone: string;
  base64: string;
  fileName: string;
  caption?: string;
}): Promise<boolean> {
  const phone = formatPhone(params.phone);
  if (!phone) throw new Error('Telefone do cliente inválido.');

  const caption = params.caption || 'Ordem de Serviço - Bandara Motos';
  const safeFileName = sanitizeFileName(params.fileName);

  // Fazer upload para Storage e enviar URL pública
  try {
    const fileUrl = await uploadBase64PdfToSupabaseStorage(params.base64, safeFileName);
    const res = await callEdgeFunction({ to: phone, fileUrl, caption, fileName: safeFileName });
    return !!res;
  } catch (error) {
    console.error('Erro no upload/envio:', error);
    throw error;
  }
}

/**
 * Helper: converte PDF em base64 para upload externo (opcional)
 *
 * Observação importante:
 * - A nova Edge Function aceita fileUrl (URL pública). Se você só tem base64,
 *   precisa hospedá-lo em algum lugar público (ex.: Storage do Supabase, S3, outro CDN)
 *   e passar a URL pública para fileUrl.
 *
 * Exemplo rápido: upload para Supabase Storage e retornar a URL pública.
 *
 * Uso:
 * const publicUrl = await uploadBase64PdfToSupabaseStorage(base64, 'mypdf.pdf');
 */
export async function uploadBase64PdfToSupabaseStorage(
  base64Data: string,
  fileName: string,
  bucket = 'public-files' // criar bucket público ou configurar políticas de acesso
): Promise<string> {
  if (!base64Data.startsWith('data:')) {
    // assumir apenas base64 puro sem prefixo data:
    base64Data = `data:application/pdf;base64,${base64Data}`;
  }

  // Remover prefixo para enviar como blob
  const base64Parts = base64Data.split(',');
  const mime = base64Parts[0].match(/data:(.*);base64/)?.[1] || 'application/octet-stream';
  const b64 = base64Parts[1];

  if (!b64) throw new Error('Base64 inválido');

  const binary = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const blob = new Blob([binary], { type: mime });

  // Fazer upload via Supabase Storage
  const supabase = getSupabase();
  const { data, error } = await supabase.storage.from(bucket).upload(fileName, blob, {
    cacheControl: '3600',
    upsert: true,
    contentType: mime,
  });

  if (error) {
    console.error('Erro ao enviar para storage:', error);
    throw error;
  }

  // Preferir URL assinada (funciona mesmo em bucket privado)
  const { data: signedData, error: signedError } = await supabase.storage
    .from(bucket)
    .createSignedUrl(data.path, 60 * 60); // 1 hora

  if (!signedError && signedData?.signedUrl) {
    return signedData.signedUrl;
  }

  // Fallback: URL pública (para bucket público)
  const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(data.path);
  const publicURL = publicData?.publicUrl;

  if (!publicURL) throw new Error('Não foi possível obter URL pública do arquivo');

  return publicURL;
}

export async function sendTestSatisfactionSurvey(): Promise<{ success: boolean; message: string; orderName?: string; phone?: string }> {
  try {
    const supabase = getSupabase();

    const SATISFACTION_MESSAGE = `Olá! Tudo bem? 😊

Aqui é da *Bandara Motos*.

Queremos saber:
👉 Como foi seu atendimento com a gente?
👉 Ficou alguma dúvida sobre o serviço ou a peça?

*De 0 a 10*, o quanto você indicaria a Bandara Motos para um amigo? ⭐

Se precisar de algo, é só responder essa mensagem.
Estamos à disposição! 🏍️🔧

Siga-nos no Instagram: @BandaraMotos`;

    const { data: orders, error } = await supabase
      .from('service_orders')
      .select('id, client_name, client_phone')
      .ilike('client_name', '%Matheus%')
      .order('created_at', { ascending: false })
      .limit(1);

    if (error || !orders || orders.length === 0) {
      return { success: false, message: 'Ordem de Matheus não encontrada' };
    }

    const order = orders[0];
    if (!order.client_phone) {
      return { success: false, message: 'Ordem de Matheus não tem telefone cadastrado' };
    }

    await sendWhatsAppText({
      phone: order.client_phone,
      text: SATISFACTION_MESSAGE
    });

    await supabase
      .from('service_orders')
      .update({ satisfaction_survey_sent_at: new Date().toISOString() })
      .eq('id', order.id);

    return {
      success: true,
      message: `✅ Mensagem enviada para ${order.client_name}`,
      orderName: order.client_name,
      phone: order.client_phone
    };
  } catch (error) {
    return { success: false, message: `❌ Erro: ${error.message}` };
  }
}

export async function testSatisfactionSurveyWith4SecondDelay(): Promise<{ success: boolean; message: string }> {
  try {
    const supabase = getSupabase();

    // Call RPC function to create payment
    const { data, error } = await supabase.rpc('test_satisfaction_survey_4seconds');

    if (error) {
      return { success: false, message: `❌ Erro na RPC: ${error.message}` };
    }

    if (!data?.success) {
      return { success: false, message: data?.message || 'Erro desconhecido na RPC' };
    }

    // Now send the satisfaction message
    const SATISFACTION_MESSAGE = `Olá! Tudo bem? 😊

Aqui é da *Bandara Motos*.

Queremos saber:
👉 Como foi seu atendimento com a gente?
👉 Ficou alguma dúvida sobre o serviço ou a peça?

*De 0 a 10*, o quanto você indicaria a Bandara Motos para um amigo? ⭐

Se precisar de algo, é só responder essa mensagem.
Estamos à disposição! 🏍️🔧

Siga-nos no Instagram: @BandaraMotos`;

    try {
      await sendWhatsAppText({
        phone: data.order_phone,
        text: SATISFACTION_MESSAGE
      });
    } catch (whatsappError) {
      console.error('❌ Erro ao enviar WhatsApp:', whatsappError);
      // Don't fail completely, RPC was successful
      return {
        success: true,
        message: `${data.message}\n\n⚠️ Erro ao enviar mensagem: ${whatsappError.message}`
      };
    }

    return {
      success: true,
      message: `${data.message}\n\n✅ Mensagem enviada para ${data.order_phone}`
    };
  } catch (error) {
    return { success: false, message: `❌ Erro: ${error.message}` };
  }
}
