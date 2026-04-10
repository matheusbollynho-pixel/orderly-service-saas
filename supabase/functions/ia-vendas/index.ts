import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || '';
const UAZAPI_BASE_URL = Deno.env.get('UAZAPI_BASE_URL') || 'https://bandara.uazapi.com';
const UAZAPI_INSTANCE_TOKEN = Deno.env.get('UAZAPI_INSTANCE_TOKEN') || '';
const DONO_PHONE = Deno.env.get('DONO_PHONE') || '';

const PLANOS = `
*📋 PLANOS SPEEDSEEK OS:*

🔹 *Básico — R$ 79/mês*
OS ilimitadas, até 2 usuários, PDF da OS, histórico de clientes, agenda da oficina, suporte via WhatsApp.

🔸 *Profissional — R$ 149/mês* ⭐ Mais popular
Tudo do Básico + usuários ilimitados, balcão/PDV, estoque completo, fluxo de caixa, relatórios, pesquisa de satisfação, WhatsApp automático, lembretes, fiados e boletos.

💎 *Premium — R$ 219/mês*
Tudo do Profissional + IA de atendimento 24h no WhatsApp, IA de estoque, domínio próprio, logo personalizada, suporte prioritário e onboarding personalizado.

✅ *7 dias grátis, sem cartão de crédito.*
`;

const SYSTEM_PROMPT = `Você é o assistente virtual de vendas do *SpeedSeek OS*, sistema completo de gestão para oficinas mecânicas.

Seu objetivo é:
1. Perguntar o nome do lead logo no início (se ainda não souber)
2. Entender o perfil da oficina (tamanho, quantos mecânicos, se usa papel ou planilha)
3. Recomendar o plano ideal
4. Enviar o acesso demo quando solicitado
5. Fechar a venda ou conectar com o responsável

PLANOS DISPONÍVEIS:
${PLANOS}

SITE: speedseekos.com.br

ACESSO DEMONSTRAÇÃO:
Quando o lead pedir a demo, PRIMEIRO pergunte: "Sua oficina trabalha com motos ou carros?" e aguarde a resposta.

Se responder *motos*:
🔗 *Link:* https://speedseekos-demo.vercel.app
📧 *Login:* demo@speedseekos.com.br
🔑 *Senha:* teste123
_Explore à vontade! É um ambiente de demonstração._
_⚠️ O envio de PDF da OS é desativado na demo — na versão real funciona normalmente._

Se responder *carros*:
🔗 *Link:* https://speedseekos-demo-carro.vercel.app
📧 *Login:* demo@speedseekos.com.br
🔑 *Senha:* teste123
_Explore à vontade! É um ambiente de demonstração._
_⚠️ O envio de PDF da OS é desativado na demo — na versão real funciona normalmente._

ATENDIMENTO HUMANO:
O responsável está disponível a qualquer hora — se o lead quiser conversar diretamente, diga: "Pode mandar mensagem aqui mesmo que o responsável já vai te atender!"

REGRAS:
- Responda sempre em português brasileiro
- Seja amigável, direto e profissional
- Máximo 3 parágrafos por resposta
- Use emojis moderadamente
- Pergunte o nome do lead na primeira ou segunda mensagem se ele não se apresentou
- Quando o lead pedir demonstração: envie o acesso acima diretamente, sem pedir e-mail
- Quando o lead quiser fechar/contratar: avise que o responsável vai entrar em contato em breve
- Não invente funcionalidades que não existem nos planos acima
- Se perguntar sobre preço, mostre os 3 planos
- Para iniciar o teste gratuito de 7 dias, o lead deve entrar em contato com o responsável`;

async function sendWhatsApp(phone: string, message: string) {
  const url = `${UAZAPI_BASE_URL}/send/text`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'token': UAZAPI_INSTANCE_TOKEN },
    body: JSON.stringify({ number: phone, text: message }),
  });
}

async function callClaude(messages: { role: string; content: string }[]): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages,
    }),
  });
  const data = await res.json();
  console.log('📌 Claude status:', res.status, '| error:', data.error?.message || 'none');
  return data.content?.[0]?.text || 'Desculpe, tive um problema. Tente novamente em instantes.';
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok', { status: 200 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return new Response('ok', { status: 200 }); }

  // Suporte ao formato UazAPI (EventType + message)
  const event = (body.event || body.EventType) as string || '';
  if (event && !event.toLowerCase().includes('message')) return new Response('ok', { status: 200 });

  // UazAPI: mensagem em body.message, contato em body.chat
  const msg = (body.message || body.data || body) as Record<string, unknown>;
  const fromMe = (msg.fromMe ?? msg.from_me) as boolean;
  if (fromMe) return new Response('ok', { status: 200 });

  // Phone vem de body.chat.wa_chatid ou body.message.chatid
  const chat = (body.chat || {}) as Record<string, unknown>;
  const rawPhone = ((chat.wa_chatid || msg.chatid || msg.phone || msg.from) as string || '');
  const phone = rawPhone.replace(/@.*$/, '').replace(/[^0-9]/g, '');

  // Texto vem de body.message.content
  const textRaw = msg.content ?? msg.text?.message ?? msg.text ?? msg.body ?? '';
  const text = (typeof textRaw === 'string' ? textRaw : JSON.stringify(textRaw)).trim();

  console.log('📌 phone:', phone, '| text:', text, '| fromMe:', fromMe);
  if (!phone || !text) return new Response('ok', { status: 200 });

  // Dedup — evita processar a mesma mensagem duas vezes
  const msgId = (msg.id || msg.messageId) as string;
  console.log('📌 Criando Supabase client...');
  const sbUrl = Deno.env.get('SB_URL') || Deno.env.get('SUPABASE_URL') || '';
  const sbKey = Deno.env.get('SB_SERVICE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  console.log('📌 sbUrl:', sbUrl ? 'OK' : 'VAZIO', '| sbKey:', sbKey ? 'OK' : 'VAZIO');
  const sb = createClient(sbUrl, sbKey);

  console.log('📌 msgId:', msgId);
  if (msgId) {
    const key = `_msg_${msgId}`;
    const { data: existing } = await sb.from('conversation_state').select('id').eq('phone', key).maybeSingle();
    if (existing) { console.log('⚠️ Dedup — já processado'); return new Response('ok', { status: 200 }); }
    await sb.from('conversation_state').insert({ phone: key, state: 'dedup', data: {} });
  }

  console.log('📌 Buscando histórico...');
  // Busca histórico da conversa
  const { data: stateRow } = await sb
    .from('conversation_state')
    .select('*')
    .eq('phone', phone)
    .neq('state', 'dedup')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const history: { role: string; content: string }[] = (stateRow?.data?.history as { role: string; content: string }[]) || [];

  console.log('📌 history.length:', history.length);
  // Mensagem de boas-vindas no primeiro contato
  if (history.length === 0) {
    const welcome = `Olá! 👋 Bem-vindo ao *SpeedSeek OS*! 🏍️

Sou o assistente virtual e estou aqui para te ajudar a conhecer nosso sistema de gestão para oficinas mecânicas.

Me conta: sua oficina hoje usa papel, planilha ou já tem algum sistema?`;
    console.log('📌 Enviando boas-vindas para:', phone);
    await sendWhatsApp(phone, welcome);
    await sb.from('conversation_state').upsert({
      phone,
      state: 'conversando',
      data: { history: [{ role: 'assistant', content: welcome }] },
    }, { onConflict: 'phone' });
    return new Response('ok', { status: 200 });
  }

  // Adiciona mensagem do usuário ao histórico
  history.push({ role: 'user', content: text });

  // Limita histórico a 20 mensagens
  const recentHistory = history.slice(-20);

  // Chama Claude
  console.log('📌 Chamando Claude...');
  let reply: string;
  try {
    reply = await callClaude(recentHistory);
    console.log('📌 Claude respondeu:', reply.slice(0, 100));
  } catch (err) {
    console.error('❌ Erro ao chamar Claude:', err);
    return new Response('ok', { status: 200 });
  }

  // Salva histórico atualizado
  recentHistory.push({ role: 'assistant', content: reply });
  await sb.from('conversation_state').upsert({
    phone,
    state: 'conversando',
    data: { history: recentHistory },
  }, { onConflict: 'phone' });

  // Envia resposta
  console.log('📌 Enviando WhatsApp para:', phone);
  await sendWhatsApp(phone, reply);
  console.log('📌 WhatsApp enviado!');

  // Avisa dono se lead demonstrou interesse forte
  const interessePalavras = ['fechar', 'contratar', 'assinar', 'quanto custa', 'como faço', 'quero comprar', 'vou pegar', 'quero assinar', 'quero contratar', 'vou assinar', 'quero fechar', 'vou fechar', 'quero o plano', 'quero começar', 'como contrato', 'como assino', 'iniciar', 'ativar', 'quero testar', 'quero a demo', 'quero demonstração'];
  const temInteresse = interessePalavras.some(p => text.toLowerCase().includes(p));
  if (temInteresse && DONO_PHONE) {
    await sendWhatsApp(DONO_PHONE,
      `🔥 *Lead quente no SpeedSeekOS!*\n📱 ${phone}\n💬 "${text}"`
    );
  }

  return new Response('ok', { status: 200 });
});
