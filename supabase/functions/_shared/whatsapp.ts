import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

export interface StoreWhatsAppConfig {
  provider?: string        // 'uazapi' | 'zapi'
  instance_url?: string    // ex: https://minhaloja.uazapi.com
  instance_token?: string  // token da instância
}

// Rótulo de qual recurso do app disparou o envio, pra dar visibilidade de
// "isso aqui tá funcionando de verdade" por tipo de mensagem (painel no SuperAdmin).
export interface SendContext {
  storeId?: string | null
  feature: string  // ex: 'satisfacao' | 'aniversario' | 'agendamento_confirmacao' | 'fiado_cobranca' | 'balcao_followup' | 'lembrete_manutencao' | 'boleto_alerta' | 'max_atendimento' | 'documento_pdf' | 'teste_manual'
}

async function logWhatsAppSend(ctx: SendContext | undefined, success: boolean, errorMessage?: string) {
  if (!ctx?.storeId) return
  try {
    await supabaseAdmin.from('whatsapp_send_log').insert({
      store_id: ctx.storeId,
      feature: ctx.feature,
      success,
      error_message: errorMessage ? errorMessage.slice(0, 500) : null,
    })
  } catch (e) {
    console.error('logWhatsAppSend falhou:', e)
  }
}

export function normalizeBrPhone(phone: string): string {
  const clean = (phone || '').replace(/\D/g, '');
  if (!clean) return '';
  return clean.startsWith('55') ? clean : `55${clean}`;
}

function resolveConfig(storeConfig?: StoreWhatsAppConfig) {
  // Quando o chamador passa um storeConfig (mesmo que incompleto), a intenção é
  // usar o WhatsApp DESSA loja especificamente — nunca cair de volta pra uma
  // instância global/compartilhada (isso já vazou o número real da Bandara Motos
  // pra mensagens de outras lojas sem WhatsApp configurado). O fallback pra
  // variáveis de ambiente só vale quando NENHUM storeConfig é passado, ou seja,
  // quando o próprio chamador optou por um envio global/não-multi-tenant.
  const isStoreScoped = storeConfig !== undefined;
  const provider = (storeConfig?.provider || (!isStoreScoped ? Deno.env.get('WHATSAPP_PROVIDER') : undefined) || 'uazapi').toLowerCase();

  if (provider === 'uazapi') {
    const base = (storeConfig?.instance_url || (!isStoreScoped ? (Deno.env.get('UAZAPI_BASE_URL') || Deno.env.get('UAZAPI_SERVER_URL')) : undefined) || '').replace(/\/$/, '');
    const token = storeConfig?.instance_token || (!isStoreScoped ? (Deno.env.get('UAZAPI_INSTANCE_TOKEN') || Deno.env.get('UAZAPI_TOKEN')) : undefined) || '';
    if (isStoreScoped && (!base || !token)) {
      throw new Error('Esta loja não tem WhatsApp configurado corretamente — falta URL ou token da instância (Configurações → Ferramentas). Envio cancelado.');
    }
    return { provider: 'uazapi', base, token };
  }

  // zapi
  const instanceId = (!isStoreScoped ? Deno.env.get('ZAPI_INSTANCE_ID') : undefined) || '';
  const token = storeConfig?.instance_token || (!isStoreScoped ? Deno.env.get('ZAPI_TOKEN') : undefined) || '';
  const clientToken = (!isStoreScoped ? Deno.env.get('ZAPI_CLIENT_TOKEN') : undefined) || '';
  if (isStoreScoped && (!instanceId || !token)) {
    throw new Error('Esta loja não tem WhatsApp configurado corretamente — falta ID da instância ou token (Configurações → Ferramentas). Envio cancelado.');
  }
  return { provider: 'zapi', instanceId, token, clientToken };
}

export async function sendWhatsAppText(phone: string, message: string, storeConfig?: StoreWhatsAppConfig, context?: SendContext) {
  const cfg = resolveConfig(storeConfig);
  const formattedPhone = normalizeBrPhone(phone);

  let url: string;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  let body: Record<string, unknown>;

  if (cfg.provider === 'uazapi') {
    if (!cfg.base) throw new Error('UazAPI: instance_url não configurada para esta loja');
    url = `${cfg.base}/send/text`;
    headers['token'] = cfg.token;
    body = { number: formattedPhone, text: message };
  } else {
    // zapi
    url = `https://api.z-api.io/instances/${encodeURIComponent(cfg.instanceId!)}/token/${encodeURIComponent(cfg.token)}/send-text`;
    if (cfg.clientToken) headers['Client-Token'] = cfg.clientToken;
    body = { phone: formattedPhone, message };
  }

  const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  const raw = await response.text().catch(() => '');

  console.log(`📡 WhatsApp [${cfg.provider}] → ${formattedPhone} | status: ${response.status} | ${raw.slice(0, 200)}`);

  await logWhatsAppSend(context, response.ok, response.ok ? undefined : `${response.status}: ${raw}`);

  if (!response.ok) {
    throw new Error(`WhatsApp API error (${response.status}): ${raw.slice(0, 200)}`);
  }

  try { return JSON.parse(raw); } catch { return raw; }
}

export async function sendWhatsAppDocument(
  phone: string,
  documentUrl: string,
  filename: string,
  caption?: string,
  storeConfig?: StoreWhatsAppConfig,
  context?: SendContext
) {
  const cfg = resolveConfig(storeConfig);
  const formattedPhone = normalizeBrPhone(phone);

  let url: string;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  let body: Record<string, unknown>;

  if (cfg.provider === 'uazapi') {
    if (!cfg.base) throw new Error('UazAPI: instance_url não configurada para esta loja');
    url = `${cfg.base}/send/document`;
    headers['token'] = cfg.token;
    body = { number: formattedPhone, url: documentUrl, fileName: filename, caption: caption || '' };
  } else {
    url = `https://api.z-api.io/instances/${encodeURIComponent(cfg.instanceId!)}/token/${encodeURIComponent(cfg.token)}/send-document/${encodeURIComponent(filename)}`;
    if (cfg.clientToken) headers['Client-Token'] = cfg.clientToken;
    body = { phone: formattedPhone, document: documentUrl, caption: caption || '' };
  }

  const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  const raw = await response.text().catch(() => '');

  console.log(`📎 WhatsApp doc [${cfg.provider}] → ${formattedPhone} | status: ${response.status}`);

  await logWhatsAppSend(context, response.ok, response.ok ? undefined : `${response.status}: ${raw}`);

  if (!response.ok) throw new Error(`WhatsApp doc error (${response.status}): ${raw.slice(0, 200)}`);
  try { return JSON.parse(raw); } catch { return raw; }
}

export async function sendWhatsAppLocation(
  phone: string,
  lat: number,
  lng: number,
  name: string,
  address: string,
  storeConfig?: StoreWhatsAppConfig,
  context?: SendContext
) {
  const cfg = resolveConfig(storeConfig);
  const formattedPhone = normalizeBrPhone(phone);

  if (cfg.provider === 'uazapi') {
    if (!cfg.base) throw new Error('UazAPI: instance_url não configurada para esta loja');
    const url = `${cfg.base}/send/location`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json', token: cfg.token };
    const body = { number: formattedPhone, latitude: lat, longitude: lng, name, address };
    const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    const raw = await response.text().catch(() => '');
    console.log(`📍 WhatsApp location → ${formattedPhone} | status: ${response.status}`);
    await logWhatsAppSend(context, response.ok, response.ok ? undefined : `${response.status}: ${raw}`);
    return raw;
  }
}
