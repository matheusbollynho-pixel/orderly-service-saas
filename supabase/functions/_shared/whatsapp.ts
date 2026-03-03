// @ts-nocheck

export function normalizeBrPhone(phone: string): string {
  const clean = (phone || '').replace(/\D/g, '');
  if (!clean) return '';
  return clean.startsWith('55') ? clean : `55${clean}`;
}

function buildDefaultUrl(): string {
  const provider = (Deno.env.get('WHATSAPP_PROVIDER') || 'zapi').toLowerCase();

  if (provider === 'uazapi') {
    const base = (Deno.env.get('UAZAPI_BASE_URL') || 'https://api.uazapi.dev').replace(/\/$/, '');
    const instanceId = Deno.env.get('UAZAPI_INSTANCE_ID') || '';
    const token = Deno.env.get('UAZAPI_TOKEN') || '';
    const pathTemplate = Deno.env.get('UAZAPI_TEXT_PATH') || '/instances/{instanceId}/token/{token}/send-text';

    const path = pathTemplate
      .replace('{instanceId}', encodeURIComponent(instanceId))
      .replace('{token}', encodeURIComponent(token));

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
    // Flexível para adaptar à documentação da UazAPI sem alterar código
    const authType = (Deno.env.get('UAZAPI_AUTH_TYPE') || 'none').toLowerCase(); // none|bearer|header
    const authHeader = Deno.env.get('UAZAPI_AUTH_HEADER') || 'Authorization';
    const authToken = Deno.env.get('UAZAPI_AUTH_TOKEN') || Deno.env.get('UAZAPI_TOKEN') || '';

    if (authType === 'bearer' && authToken) {
      headers[authHeader] = `Bearer ${authToken}`;
    } else if (authType === 'header' && authToken) {
      headers[authHeader] = authToken;
    }

    const clientToken = Deno.env.get('UAZAPI_CLIENT_TOKEN') || '';
    const clientTokenHeader = Deno.env.get('UAZAPI_CLIENT_TOKEN_HEADER') || 'Client-Token';
    if (clientToken) {
      headers[clientTokenHeader] = clientToken;
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
    const phoneField = Deno.env.get('UAZAPI_PHONE_FIELD') || 'phone';
    const messageField = Deno.env.get('UAZAPI_MESSAGE_FIELD') || 'message';

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
  let parsed: any = null;
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
