/**
 * webhook-whatsapp
 * Recebe webhooks da UazAPI, filtra mensagens relevantes
 * e encaminha para ia-atendimento.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Requested-With, Authorization',
};

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
);

// Loja "dona" da instância global (compartilhada, sem whatsapp_instance_url
// próprio) — só existe pra manter compatibilidade com a Bandara Motos, que
// foi criada antes do sistema virar multi-tenant. Toda loja nova deve ter
// whatsapp_instance_url próprio configurado no SuperAdmin.
const LEGACY_DEFAULT_STORE_ID = '9fd27114-97d1-48cd-ad09-1b057fa9c185';

// Resolve qual loja é dona da instância UazAPI que mandou esse webhook.
// BaseUrl NÃO é confiável sozinho — várias lojas podem compartilhar o mesmo
// servidor UazAPI (mesmo BaseUrl, tokens/instâncias diferentes), então essa
// busca por whatsapp_instance_url pode achar mais de uma loja e não serve
// pra desambiguar. Por isso todo store novo precisa ter o webhook configurado
// na UazAPI com "?store_id=<id>" na URL — isso é lido antes de qualquer
// heurística. O fallback por BaseUrl só cobre a Bandara Motos (legado, de
// quando o sistema era single-tenant e não tinha esse parâmetro).
async function resolveStoreIdFromBaseUrl(baseUrl: string | undefined): Promise<string> {
  if (baseUrl) {
    const clean = baseUrl.replace(/\/$/, '');
    const { data, error } = await supabaseAdmin
      .from('store_settings')
      .select('id')
      .eq('whatsapp_instance_url', clean);
    if (!error && data && data.length === 1) return data[0].id as string;
    if (data && data.length > 1) {
      console.warn(`⚠️ ${data.length} lojas compartilham whatsapp_instance_url="${clean}" — BaseUrl não desambigua, configure ?store_id= no webhook dessa instância`);
    } else {
      console.warn(`⚠️ Nenhuma loja com whatsapp_instance_url="${clean}" — usando fallback legado`);
    }
  }
  return LEGACY_DEFAULT_STORE_ID;
}

// Extrai o número de telefone limpo (apenas dígitos) do remoteJid
function extractPhone(remoteJid: string): string | null {
  if (!remoteJid) return null;
  // Grupos têm @g.us — ignorar
  if (remoteJid.includes('@g.us')) return null;
  // Remove o sufixo @s.whatsapp.net e caracteres não numéricos
  return remoteJid.replace('@s.whatsapp.net', '').replace(/\D/g, '');
}

// Extrai o texto da mensagem em diferentes formatos da UazAPI / Evolution API
function extractText(message: Record<string, unknown>): string | null {
  if (!message) return null;

  // Formato direto (conversation)
  if (typeof message.conversation === 'string') return message.conversation;

  // Texto estendido
  const ext = message.extendedTextMessage as Record<string, unknown> | undefined;
  if (ext?.text) return ext.text as string;

  // Imagem com legenda
  const img = message.imageMessage as Record<string, unknown> | undefined;
  if (img?.caption) return img.caption as string;

  // Botão de resposta
  const btn = message.buttonsResponseMessage as Record<string, unknown> | undefined;
  if (btn?.selectedDisplayText) return btn.selectedDisplayText as string;

  // Lista de resposta
  const list = message.listResponseMessage as Record<string, unknown> | undefined;
  const listRow = list?.singleSelectReply as Record<string, unknown> | undefined;
  if (listRow?.selectedRowId) return listRow.selectedRowId as string;

  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  try {
    // Ler como texto para poder extrair campos duplicados do UazAPI GO
    const bodyText = await req.text().catch(() => '{}');
    let body: Record<string, unknown> = {};
    try { body = JSON.parse(bodyText); } catch { /* ignore */ }

    // Log completo para debug (sem corte)
    console.log('📩 Webhook recebido FULL:', JSON.stringify(body));

    // Extrair dados da mensagem
    let phone: string | null = null;
    let text: string | null = null;
    let fromMe = false;
    let senderName = '';
    let messageId: string | null = null;

    // --------------------------------------------------------
    // Formato UazAPI (bandara.uazapi.com)
    // { BaseUrl, EventType: "messages", messages: {...}, chat: {...} }
    // --------------------------------------------------------
    if (body.BaseUrl || body.EventType) {
      const eventType = (body.EventType as string || '').toLowerCase();

      // Ignorar eventos que não são mensagens
      if (eventType && eventType !== 'messages') {
        console.log(`⏭️ EventType ignorado: ${body.EventType}`);
        return new Response(JSON.stringify({ received: true, ignored: true }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // UazAPI GO usa "message" (singular) — suporte a ambos
      const msgs = (body.message || body.messages) as Record<string, unknown> | Record<string, unknown>[] | undefined;
      const msgObj = Array.isArray(msgs) ? msgs[0] : msgs;

      if (msgObj) {
        fromMe = Boolean(msgObj.fromMe || msgObj.from_me);

        const msgObjFull = msgObj as Record<string, unknown>;

        // Ignorar mensagem de GRUPO — sender_pn/sender é sempre a pessoa que
        // postou, mesmo dentro de um grupo, então sem esse filtro o Max
        // respondia no PRIVADO de todo mundo que falava em algum grupo
        const chatObj = (body.chat || {}) as Record<string, unknown>
        const possiveisIdsChat = [
          msgObjFull.chatid, msgObjFull.chatId, msgObjFull.from,
          chatObj.id, chatObj.wa_chatid,
        ].filter((v): v is string => typeof v === 'string')
        const ehGrupo = Boolean(msgObjFull.isGroup) || possiveisIdsChat.some(id => id.includes('@g.us'))
        if (ehGrupo) {
          console.log('⏭️ Mensagem de grupo — ignorada')
          return new Response(JSON.stringify({ received: true, ignored: 'group_message' }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        // Extrair ID único da mensagem para deduplicação
        messageId = (msgObjFull.id as string) || null;

        // PRIMARY: sender_pn = phone number do remetente (campo explícito da UazAPI GO)
        const senderPn = msgObjFull.sender_pn as string | undefined;
        if (senderPn) {
          const p = senderPn.replace(/\D/g, '');
          if (p.length >= 10 && p.length <= 15) phone = p;
        }

        // FALLBACK 1: sender (JID do remetente, ignorar se for @lid)
        if (!phone || phone.length < 10) {
          const senderJid = msgObjFull.sender as string | undefined;
          if (senderJid && !senderJid.includes('@lid')) {
            const p = senderJid.replace(/\D/g, '');
            if (p.length >= 10 && p.length <= 15) phone = p;
          }
        }

        // FALLBACK 2: chatId na seção message do body bruto
        // formato UazAPI GO: "NUMBERs.whatsapp.net" (sem @)
        if (!phone || phone.length < 10) {
          const msgStart = bodyText.indexOf('"message":');
          const msgSection = msgStart >= 0 ? bodyText.slice(msgStart) : '';
          const chatIdNetMatch = msgSection.match(/"chatId"\s*:\s*"(\d+)[@.]?s?\.?whatsapp\.net"/);
          if (chatIdNetMatch) {
            let p = chatIdNetMatch[1].replace(/\D/g, '');
            if (p.length === 14 && p.startsWith('55')) p = p.slice(0, 13);
            if (p.length >= 10 && p.length <= 13) phone = p;
          }
        }

        console.log('🔍 sender_pn:', msgObjFull.sender_pn, '→ phone extraído:', phone, '| messageId:', messageId);

        // Texto: body, caption, text
        text = (msgObj.body || msgObj.caption || msgObj.text) as string | null;
        senderName = (msgObj.senderName || msgObj.notifyName || '') as string;
      }

    // --------------------------------------------------------
    // Formato Evolution API: { event, data: { key, message, pushName } }
    // --------------------------------------------------------
    } else if (body.data) {
      const event = body.event as string | undefined;
      const messageEvents = ['messages.upsert', 'message', 'MESSAGE_RECEIVED'];
      if (event && !messageEvents.includes(event)) {
        console.log(`⏭️ Evento ignorado: ${event}`);
        return new Response(JSON.stringify({ received: true, ignored: true }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const data = body.data as Record<string, unknown>;
      const key = data.key as Record<string, unknown> | undefined;
      fromMe = Boolean(key?.fromMe);
      const remoteJid = (key?.remoteJid as string) || '';
      messageId = (key?.id as string) || null;
      phone = extractPhone(remoteJid);
      senderName = (data.pushName as string) || '';

      const msg = data.message as Record<string, unknown> | undefined;
      text = msg ? extractText(msg) : null;
      if (!text && typeof data.text === 'string') text = data.text;
      if (!text && typeof data.body === 'string') text = data.body;

    // --------------------------------------------------------
    // Formato flat genérico
    // --------------------------------------------------------
    } else {
      const rawPhone = (body.phone || body.from || body.number) as string | undefined;
      phone = rawPhone ? rawPhone.replace(/\D/g, '') : null;
      fromMe = Boolean(body.fromMe || body.from_me);
      text = (body.message || body.text || body.body) as string | null;
      senderName = (body.pushName || body.name || '') as string;
      messageId = (body.id as string) || null;
    }

    // Resolve a loja dona dessa instância UazAPI ANTES de qualquer encaminhamento.
    // Prioridade 1: ?store_id= na própria URL do webhook (configurado por loja
    // na UazAPI) — nunca é ambíguo. Prioridade 2: heurística por BaseUrl (legado).
    const storeIdFromQuery = new URL(req.url).searchParams.get('store_id') || undefined;
    const resolvedStoreId = storeIdFromQuery || await resolveStoreIdFromBaseUrl(body.BaseUrl as string | undefined);

    // Mensagem enviada pelo atendente → encaminhar para ia-atendimento pausar o bot
    if (fromMe) {
      const supabaseUrlFm = Deno.env.get('SUPABASE_URL') || '';
      const serviceKeyFm = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
      if (phone && phone.length >= 10 && supabaseUrlFm) {
        fetch(`${supabaseUrlFm}/functions/v1/ia-atendimento?store_id=${resolvedStoreId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceKeyFm}`,
          },
          body: JSON.stringify({
            phone,
            text: text?.trim() || '',
            sender_name: senderName,
            fromMe: true,
          }),
        }).catch((err) => console.error('❌ Erro ao chamar ia-atendimento (fromMe):', err));
        console.log(`⏸️ Atendente assumiu conversa com ${phone} — IA será pausada`);
      }
      return new Response(JSON.stringify({ received: true, handled: 'fromMe_forwarded' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Ignorar se não tem telefone válido (grupo ou erro)
    if (!phone || phone.length < 10) {
      console.log('⏭️ Telefone inválido ou grupo — ignorado');
      return new Response(JSON.stringify({ received: true, ignored: 'invalid_phone' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Ignorar se não tem texto
    if (!text || text.trim() === '') {
      console.log('⏭️ Mensagem sem texto — ignorada');
      return new Response(JSON.stringify({ received: true, ignored: 'no_text' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // --------------------------------------------------------
    // Deduplicação por messageId
    // Usa a tabela conversation_state (UNIQUE em phone) para garantir
    // que a mesma mensagem seja processada apenas uma vez,
    // mesmo que a UazAPI dispare o webhook múltiplas vezes.
    // --------------------------------------------------------
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    if (messageId) {
      const dedupKey = `_msg_${messageId}`;
      const sb = createClient(supabaseUrl, serviceKey);
      const { error: dedupError } = await sb
        .from('conversation_state')
        .insert({ phone: dedupKey, state: 'dedup', context: {} });

      if (dedupError) {
        // Já existe — mensagem duplicada, ignorar
        console.log(`⏭️ Mensagem duplicada ignorada (messageId: ${messageId})`);
        return new Response(JSON.stringify({ received: true, ignored: 'duplicate' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log(`✅ Dedup OK — processando mensagem ${messageId}`);
    }

    console.log(`📱 Mensagem de ${phone} (${senderName}): "${text.slice(0, 100)}"`);

    // Chamar ia-atendimento em background (fire-and-forget) para retornar 200 imediatamente
    fetch(`${supabaseUrl}/functions/v1/ia-atendimento?store_id=${resolvedStoreId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        phone,
        text: text.trim(),
        sender_name: senderName,
      }),
    }).then((iaRes) => {
      if (!iaRes.ok) {
        iaRes.text().then((err) => console.error(`❌ ia-atendimento error: ${err}`));
      } else {
        console.log('✅ ia-atendimento invocado com sucesso');
      }
    }).catch((err) => console.error('❌ Erro ao chamar ia-atendimento:', err));

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Erro no webhook:', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
