// src/services/whatsappService.ts

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('VITE_SUPABASE_URL ou VITE_SUPABASE_PUBLISHABLE_KEY não configurados');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function formatPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  // Precisa ter código do país (55) + DDD + número
  if (digits.length < 12) {
    return digits.length >= 10 ? `55${digits}` : null;
  }
  return digits;
}

async function callEdgeFunction(payload: Record<string, unknown>): Promise<any> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const token = session?.access_token || SUPABASE_ANON_KEY;

  const res = await fetch(`${SUPABASE_URL}/functions/v1/enviar-documento-whatsapp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
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
    const msg = json?.error || json?.message || `Falha na função (status ${res.status})`;
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

  const fileUrl = await uploadBase64PdfToSupabaseStorage(params.base64, params.fileName);
  const res = await callEdgeFunction({ to: phone, fileUrl, caption: params.caption || 'Ordem de Serviço - Bandara Motos' });
  return !!res;
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
  const { data, error } = await supabase.storage.from(bucket).upload(fileName, blob, {
    cacheControl: '3600',
    upsert: true,
    contentType: mime,
  });

  if (error) {
    console.error('Erro ao enviar para storage:', error);
    throw error;
  }

  // Gerar URL pública (assume bucket público). Se for privado, gere signed URL.
  const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(data.path);
  const publicURL = publicData?.publicUrl;

  if (!publicURL) throw new Error('Não foi possível obter URL pública do arquivo');

  return publicURL;
}
