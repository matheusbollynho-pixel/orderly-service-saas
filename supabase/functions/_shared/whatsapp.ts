export interface StoreWhatsAppConfig {
  provider?: string        // 'uazapi' | 'zapi'
  instance_url?: string    // ex: https://minhaloja.uazapi.com
  instance_token?: string  // token da instância
}

export function normalizeBrPhone(phone: string): string {
  const clean = (phone || '').replace(/\D/g, '');
  if (!clean) return '';
  return clean.startsWith('55') ? clean : `55${clean}`;
}

function resolveConfig(storeConfig?: StoreWhatsAppConfig) {
  const provider = (storeConfig?.provider || Deno.env.get('WHATSAPP_PROVIDER') || 'uazapi').toLowerCase();

  if (provider === 'uazapi') {
    const base = (storeConfig?.instance_url || Deno.env.get('UAZAPI_BASE_URL') || Deno.env.get('UAZAPI_SERVER_URL') || '').replace(/\/$/, '');
    const token = storeConfig?.instance_token || Deno.env.get('UAZAPI_INSTANCE_TOKEN') || Deno.env.get('UAZAPI_TOKEN') || '';
    return { provider: 'uazapi', base, token };
  }

  // zapi
  const instanceId = Deno.env.get('ZAPI_INSTANCE_ID') || '';
  const token = storeConfig?.instance_token || Deno.env.get('ZAPI_TOKEN') || '';
  const clientToken = Deno.env.get('ZAPI_CLIENT_TOKEN') || '';
  return { provider: 'zapi', instanceId, token, clientToken };
}

export async function sendWhatsAppText(phone: string, message: string, storeConfig?: StoreWhatsAppConfig) {
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
  storeConfig?: StoreWhatsAppConfig
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

  if (!response.ok) throw new Error(`WhatsApp doc error (${response.status}): ${raw.slice(0, 200)}`);
  try { return JSON.parse(raw); } catch { return raw; }
}

export async function sendWhatsAppLocation(
  phone: string,
  lat: number,
  lng: number,
  name: string,
  address: string,
  storeConfig?: StoreWhatsAppConfig
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
    return raw;
  }
}
