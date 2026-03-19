// ...existing code...
// ...existing code...
export function normalizeBrPhone(phone: string): string {
  const clean = (phone || '').replace(/\D/g, '');
  if (!clean) return '';
  return clean.startsWith('55') ? clean : `55${clean}`;
}

function buildDefaultUrl(): string {
  const provider = (Deno.env.get('WHATSAPP_PROVIDER') || 'zapi').toLowerCase();

  if (provider === 'uazapi') {
    // UazAPI v2 (Bandara): endpoint de texto padrão
    const base = (Deno.env.get('UAZAPI_BASE_URL') || Deno.env.get('UAZAPI_SERVER_URL') || 'https://bandara.uazapi.com').replace(/\/$/, '');
    const path = Deno.env.get('UAZAPI_TEXT_PATH') || '/send/text';
    return `${base}${path}`;
  }

  // zapi (default)
  const instanceId = Deno.env.get('ZAPI_INSTANCE_ID') || '';
  const token = Deno.env.get('ZAPI_TOKEN') || '';
  return `https://api.z-api.io/instances/${encodeURIComponent(instanceId)}/token/${encodeURIComponent(token)}/send-text`;
}

function buildHeaders(): Record<string, string> {
  const provider = (Deno.env.get('WHATSAPP_PROVIDER') || 'zapi').toLowerCase();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (provider === 'uazapi') {
    // Padrão UazAPI v2: header token com INSTANCE token
    const instanceToken = Deno.env.get('UAZAPI_INSTANCE_TOKEN') || Deno.env.get('UAZAPI_TOKEN') || '';
    if (instanceToken) {
      headers['token'] = instanceToken;
    }

    // Compatibilidade opcional com configurações antigas
    const authType = (Deno.env.get('UAZAPI_AUTH_TYPE') || '').toLowerCase(); // bearer|header
    const authHeader = Deno.env.get('UAZAPI_AUTH_HEADER') || 'Authorization';
    const authToken = Deno.env.get('UAZAPI_AUTH_TOKEN') || '';
    if (authType === 'bearer' && authToken) {
      headers[authHeader] = `Bearer ${authToken}`;
    } else if (authType === 'header' && authToken) {
      headers[authHeader] = authToken;
    }

    return headers;
  }

  // zapi
  const zapiClientToken = Deno.env.get('ZAPI_CLIENT_TOKEN') || '';
  if (zapiClientToken) {
    headers['Client-Token'] = zapiClientToken;
  }
  return headers;
}

function buildBody(phone: string, message: string): Record<string, unknown> {
  const provider = (Deno.env.get('WHATSAPP_PROVIDER') || 'zapi').toLowerCase();
  const formattedPhone = normalizeBrPhone(phone);

  if (provider === 'uazapi') {
    const phoneField = Deno.env.get('UAZAPI_PHONE_FIELD') || 'number';
    const messageField = Deno.env.get('UAZAPI_MESSAGE_FIELD') || 'text';

    return {
      [phoneField]: formattedPhone,
      [messageField]: message,
    };
  }

  return {
    phone: formattedPhone,
    message,
  };
}

export async function sendWhatsAppText(phone: string, message: string) {
  const explicitUrl = Deno.env.get('WHATSAPP_TEXT_URL') || '';
  const url = explicitUrl || buildDefaultUrl();
  const headers = buildHeaders();
  const body = buildBody(phone, message);

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const raw = await response.text().catch(() => '');
  let parsed: Record<string, unknown> | string | null = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = raw;
  }

  if (!response.ok) {
    throw new Error(`WhatsApp API error (${response.status}): ${typeof parsed === 'string' ? parsed : JSON.stringify(parsed)}`);
  }

  return parsed;
}
