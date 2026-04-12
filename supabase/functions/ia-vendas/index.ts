import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || '';
const UAZAPI_BASE_URL = Deno.env.get('UAZAPI_BASE_URL') || 'https://bandara.uazapi.com';
const UAZAPI_INSTANCE_TOKEN = Deno.env.get('UAZAPI_INSTANCE_TOKEN') || '';
const DONO_PHONE = Deno.env.get('DONO_PHONE') || '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

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
3. Perguntar se a oficina trabalha com *motos* ou *carros* — isso é essencial para mostrar a demo correta
4. Recomendar o plano ideal
5. Quando o lead quiser testar ou contratar: coletar nome completo, e-mail e criar o acesso automaticamente

PLANOS DISPONÍVEIS:
${PLANOS}

SITE: speedseekos.com.br

ACESSO DEMONSTRAÇÃO:
Quando o lead pedir demo/teste:
- Se ainda não souber se é moto ou carro, pergunte primeiro
- Se já souber, envie o link da demo correspondente:

Se *motos*:
🔗 https://speedseekos-demo.vercel.app
📧 demo@speedseekos.com.br | 🔑 teste123

Se *carros*:
🔗 https://speedseekos-demo-carro.vercel.app
📧 demo@speedseekos.com.br | 🔑 teste123

CRIAÇÃO DE CONTA (teste grátis de 5 dias):
Quando o lead quiser começar o teste gratuito real (não só a demo):
1. Pergunte o *nome da oficina*
2. Pergunte o *e-mail* para acesso
3. Quando tiver nome da oficina + e-mail + tipo de veículo, responda EXATAMENTE neste formato (sem mais nada antes ou depois):
CRIAR_CONTA|nome_oficina|email|tipo_veiculo
Exemplo: CRIAR_CONTA|Bandara Motos|dono@email.com|moto

ATENDIMENTO HUMANO:
Se o lead quiser conversar com o responsável diretamente, diga: "Pode mandar mensagem aqui mesmo que o responsável já vai te atender!"

REGRAS:
- Responda sempre em português brasileiro
- Seja amigável, direto e profissional
- Máximo 3 parágrafos por resposta
- Use emojis moderadamente
- Pergunte o nome na primeira ou segunda mensagem
- Não invente funcionalidades
- Se perguntar sobre preço, mostre os 3 planos`;

const PLAN_LABELS: Record<string, string> = {
  basic: 'Básico', pro: 'Profissional', premium: 'Premium', enterprise: 'Enterprise', trial: 'Trial',
};

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
  return data.content?.[0]?.text || 'Desculpe, tive um problema. Tente novamente em instantes.';
}

// Normaliza telefone para comparação (remove 55, DDD etc)
function normalizePhone(p: string): string {
  return p.replace(/\D/g, '').replace(/^55/, '').slice(-9);
}

// Busca store pelo telefone do WhatsApp
async function findStoreByPhone(phone: string, sb: ReturnType<typeof createClient>) {
  const suffix = normalizePhone(phone);

  // Tenta bater em store_settings.store_phone
  const { data: stores } = await sb
    .from('store_settings')
    .select('id, company_name, plan, store_phone, asaas_customer_id')
    .like('store_phone', `%${suffix}`)

  if (stores && stores.length > 0) return stores[0] as Record<string, unknown>;

  // Tenta bater em saas_subscriptions.owner_phone
  const { data: subs } = await sb
    .from('saas_subscriptions')
    .select('store_id, plan, amount, due_date, status')
    .like('owner_phone', `%${suffix}`)
    .order('created_at', { ascending: false })
    .limit(1)

  if (subs && subs.length > 0) {
    const sub = subs[0] as Record<string, unknown>
    const { data: store } = await sb
      .from('store_settings')
      .select('id, company_name, plan, store_phone, asaas_customer_id')
      .eq('id', sub.store_id)
      .maybeSingle()
    return store ?? null
  }
  return null
}

// Busca subscription da loja
async function getStoreSub(storeId: string, sb: ReturnType<typeof createClient>) {
  const { data } = await sb
    .from('saas_subscriptions')
    .select('plan, amount, status, due_date, paid_at')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data as Record<string, unknown> | null
}

// Chama edge function gerar-cobranca
async function gerarCobranca(storeId: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/gerar-cobranca`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ store_id: storeId }),
    })
    return await res.json()
  } catch {
    return null
  }
}

function menuCliente(companyName: string): string {
  return `Encontrei sua conta! 🎉

*${companyName}*

O que você precisa hoje?

1️⃣ 💳 Gerar link de pagamento (PIX)
2️⃣ 📊 Ver status da assinatura
3️⃣ ⬆️ Fazer upgrade de plano
4️⃣ 🆘 Falar com suporte

Digite o número da opção ou descreva o que precisa.`
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok', { status: 200 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return new Response('ok', { status: 200 }); }

  const event = (body.event || body.EventType) as string || '';
  if (event && !event.toLowerCase().includes('message')) return new Response('ok', { status: 200 });

  const msg = (body.message || body.data || body) as Record<string, unknown>;
  const fromMe = (msg.fromMe ?? msg.from_me) as boolean;
  if (fromMe) return new Response('ok', { status: 200 });

  const chat = (body.chat || {}) as Record<string, unknown>;
  const rawPhone = ((chat.wa_chatid || msg.chatid || msg.phone || msg.from) as string || '');
  const phone = rawPhone.replace(/@.*$/, '').replace(/[^0-9]/g, '');

  const textRaw = msg.content ?? msg.text?.message ?? msg.text ?? msg.body ?? '';
  const text = (typeof textRaw === 'string' ? textRaw : JSON.stringify(textRaw)).trim();

  if (!phone || !text) return new Response('ok', { status: 200 });

  const msgId = (msg.id || msg.messageId) as string;
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Dedup
  if (msgId) {
    const key = `_msg_${msgId}`;
    const { data: existing } = await sb.from('conversation_state').select('id').eq('phone', key).maybeSingle();
    if (existing) return new Response('ok', { status: 200 });
    await sb.from('conversation_state').insert({ phone: key, state: 'dedup', data: {} });
  }

  // Busca estado atual
  const { data: stateRow } = await sb
    .from('conversation_state')
    .select('*')
    .eq('phone', phone)
    .neq('state', 'dedup')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const stateData = (stateRow?.data || {}) as Record<string, unknown>;
  const currentState = (stateRow?.state as string) || 'inicio';
  const history = (stateData.history as { role: string; content: string }[]) || [];
  const clienteStoreId = stateData.store_id as string | undefined;
  const clienteNome = stateData.company_name as string | undefined;

  // ─── PRIMEIRO CONTATO ────────────────────────────────────────────────────────
  if (currentState === 'inicio' || history.length === 0) {
    const welcome = `Olá! 👋 Bem-vindo ao *SpeedSeek OS*!

Você é novo por aqui ou já é nosso cliente?

1️⃣ *Quero conhecer o sistema*
2️⃣ *Já sou cliente SpeedSeek*`;

    await sendWhatsApp(phone, welcome);
    await sb.from('conversation_state').upsert({
      phone,
      state: 'aguardando_tipo',
      data: { history: [{ role: 'assistant', content: welcome }] },
    }, { onConflict: 'phone' });
    return new Response('ok', { status: 200 });
  }

  // ─── AGUARDANDO TIPO (novo ou existente) ──────────────────────────────────────
  if (currentState === 'aguardando_tipo') {
    const lower = text.toLowerCase();
    const isExistente =
      text.trim() === '2' ||
      lower.includes('já sou') || lower.includes('ja sou') ||
      lower.includes('já cliente') || lower.includes('ja cliente') ||
      lower.includes('cliente') || lower.includes('já uso') || lower.includes('ja uso') ||
      lower.includes('pagar') || lower.includes('pagamento') || lower.includes('renovar') ||
      lower.includes('assinatura') || lower.includes('minha conta');

    if (isExistente) {
      // Tenta identificar pelo telefone do WhatsApp automaticamente
      const store = await findStoreByPhone(phone, sb);
      if (store) {
        const menu = menuCliente(store.company_name as string || 'sua oficina');
        await sendWhatsApp(phone, menu);
        await sb.from('conversation_state').upsert({
          phone,
          state: 'cliente_menu',
          data: {
            store_id: store.id,
            company_name: store.company_name,
            history: [...history, { role: 'user', content: text }, { role: 'assistant', content: menu }],
          },
        }, { onConflict: 'phone' });
        return new Response('ok', { status: 200 });
      }

      // Não encontrou pelo telefone — pede email
      const pedirEmail = `Ótimo! Para encontrar sua conta, qual é o *e-mail cadastrado* no SpeedSeek OS?`;
      await sendWhatsApp(phone, pedirEmail);
      await sb.from('conversation_state').upsert({
        phone,
        state: 'aguardando_email_cliente',
        data: { history: [...history, { role: 'user', content: text }, { role: 'assistant', content: pedirEmail }] },
      }, { onConflict: 'phone' });
      return new Response('ok', { status: 200 });
    }

    // É novo lead — vai para fluxo de vendas com Claude
    const newHistory = [...history, { role: 'user', content: text }];
    const reply = await callClaude(newHistory.slice(-20));
    newHistory.push({ role: 'assistant', content: reply });
    await sendWhatsApp(phone, reply);
    await sb.from('conversation_state').upsert({
      phone, state: 'conversando', data: { history: newHistory },
    }, { onConflict: 'phone' });
    return new Response('ok', { status: 200 });
  }

  // ─── AGUARDANDO EMAIL DO CLIENTE EXISTENTE ────────────────────────────────────
  if (currentState === 'aguardando_email_cliente') {
    const emailInput = text.trim().toLowerCase();
    const { data: store } = await sb
      .from('store_settings')
      .select('id, company_name, plan')
      .ilike('owner_email', emailInput)
      .maybeSingle();

    if (!store) {
      const notFound = `Não encontrei nenhuma conta com o e-mail *${emailInput}*. 😕\n\nVerifica se digitou certo ou fala com nosso suporte!`;
      await sendWhatsApp(phone, notFound);
      await sb.from('conversation_state').upsert({
        phone,
        state: 'aguardando_email_cliente',
        data: { history: [...history, { role: 'user', content: text }, { role: 'assistant', content: notFound }] },
      }, { onConflict: 'phone' });
      return new Response('ok', { status: 200 });
    }

    const menu = menuCliente(store.company_name || 'sua oficina');
    await sendWhatsApp(phone, menu);
    await sb.from('conversation_state').upsert({
      phone,
      state: 'cliente_menu',
      data: {
        store_id: store.id,
        company_name: store.company_name,
        history: [...history, { role: 'user', content: text }, { role: 'assistant', content: menu }],
      },
    }, { onConflict: 'phone' });
    return new Response('ok', { status: 200 });
  }

  // ─── MENU DO CLIENTE ──────────────────────────────────────────────────────────
  if (currentState === 'cliente_menu' && clienteStoreId) {
    const lower = text.toLowerCase();
    const opcao1 = text === '1' || lower.includes('pagamento') || lower.includes('pagar') || lower.includes('pix') || lower.includes('renovar');
    const opcao2 = text === '2' || lower.includes('status') || lower.includes('assinatura') || lower.includes('plano');
    const opcao3 = text === '3' || lower.includes('upgrade') || lower.includes('mudar plano') || lower.includes('trocar plano');
    const opcao4 = text === '4' || lower.includes('suporte') || lower.includes('ajuda') || lower.includes('problema') || lower.includes('humano');

    if (opcao1) {
      const gerando = `⏳ Gerando seu PIX, aguarde um instante...`;
      await sendWhatsApp(phone, gerando);

      const cobranca = await gerarCobranca(clienteStoreId);

      let reply: string;
      if (cobranca?.success) {
        const valor = (cobranca.amount as number).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        reply = `✅ *Cobrança gerada!*\n\nPlano: *${cobranca.plan_label}*\nValor: *${valor}*\nVencimento: *${cobranca.due_date}*`

        if (cobranca.pix_code) {
          reply += `\n\n📋 *Pix Copia e Cola:*\n${cobranca.pix_code}`
        }
        if (cobranca.invoice_url) {
          reply += `\n\n🔗 *Ver fatura completa:*\n${cobranca.invoice_url}`
        }
        reply += `\n\nApós o pagamento sua conta é ativada automaticamente! 🚀`
      } else {
        reply = `Não consegui gerar o PIX automaticamente. 😕\n\nEntre em contato com o suporte ou acesse *app.speedseekos.com.br → Minha Conta* para gerar o pagamento.`
      }

      await sendWhatsApp(phone, reply);
      // Volta ao menu após enviar
      const newMenu = `\n\nAlguma outra dúvida?\n\n1️⃣ 💳 Gerar novo pagamento\n2️⃣ 📊 Ver status\n3️⃣ ⬆️ Upgrade\n4️⃣ 🆘 Suporte`;
      await sendWhatsApp(phone, newMenu);
      await sb.from('conversation_state').upsert({
        phone, state: 'cliente_menu',
        data: { store_id: clienteStoreId, company_name: clienteNome, history: [...history, { role: 'user', content: text }, { role: 'assistant', content: reply }] },
      }, { onConflict: 'phone' });
      return new Response('ok', { status: 200 });
    }

    if (opcao2) {
      const sub = await getStoreSub(clienteStoreId, sb);
      let reply: string;
      if (sub) {
        const statusEmoji: Record<string, string> = { active: '✅', pending: '⏳', overdue: '⚠️', cancelled: '❌' };
        const statusLabel: Record<string, string> = { active: 'Ativa', pending: 'Pendente', overdue: 'Vencida', cancelled: 'Cancelada' };
        const valor = sub.amount ? (sub.amount as number).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—';
        const venc = sub.due_date ? new Date(sub.due_date as string).toLocaleDateString('pt-BR') : '—';
        reply = `📊 *Status da sua assinatura:*\n\n🏪 *${clienteNome}*\n💼 Plano: *${PLAN_LABELS[sub.plan as string] || sub.plan}*\n💰 Valor: *${valor}/mês*\n📅 Próximo vencimento: *${venc}*\n${statusEmoji[sub.status as string] || '•'} Status: *${statusLabel[sub.status as string] || sub.status}*`
        if (sub.status === 'overdue') {
          reply += `\n\n⚠️ Sua conta está com pagamento vencido. Digite *1* para gerar um PIX e regularizar agora!`
        }
      } else {
        reply = `Não encontrei assinatura ativa. Entre em contato com o suporte!`
      }
      await sendWhatsApp(phone, reply);
      await sb.from('conversation_state').upsert({
        phone, state: 'cliente_menu',
        data: { store_id: clienteStoreId, company_name: clienteNome, history: [...history, { role: 'user', content: text }, { role: 'assistant', content: reply }] },
      }, { onConflict: 'phone' });
      return new Response('ok', { status: 200 });
    }

    if (opcao3) {
      const reply = `⬆️ *Opções de upgrade:*\n\n🔹 *Básico — R$ 79/mês*\nOS ilimitadas, agenda, até 2 usuários\n🔗 https://www.asaas.com/c/vz4xmubsyo6qjny1\n\n🔸 *Profissional — R$ 149/mês*\nBalcão/PDV, estoque, relatórios, WhatsApp automático, fiados, boletos\n🔗 https://www.asaas.com/c/8swycr4f636vo1za\n\n💎 *Premium — R$ 219/mês*\nTudo do Profissional + IA de atendimento 24h, domínio próprio, suporte prioritário\n🔗 https://www.asaas.com/c/qocck5e1633zxrpl\n\nApós o pagamento seu plano é atualizado automaticamente! 🚀`
      await sendWhatsApp(phone, reply);
      await sb.from('conversation_state').upsert({
        phone, state: 'cliente_menu',
        data: { store_id: clienteStoreId, company_name: clienteNome, history: [...history, { role: 'user', content: text }, { role: 'assistant', content: reply }] },
      }, { onConflict: 'phone' });
      return new Response('ok', { status: 200 });
    }

    if (opcao4) {
      const reply = `🆘 Vou chamar o suporte agora!\n\nEm instantes alguém vai te atender aqui mesmo. 😊`
      await sendWhatsApp(phone, reply);
      if (DONO_PHONE) {
        await sendWhatsApp(DONO_PHONE, `🆘 *Suporte solicitado por cliente!*\n📱 ${phone}\n🏪 ${clienteNome}\n💬 "${text}"`)
      }
      await sb.from('conversation_state').upsert({
        phone, state: 'cliente_menu',
        data: { store_id: clienteStoreId, company_name: clienteNome, history: [...history, { role: 'user', content: text }, { role: 'assistant', content: reply }] },
      }, { onConflict: 'phone' });
      return new Response('ok', { status: 200 });
    }

    // Não reconheceu opção
    const menu2 = menuCliente(clienteNome || 'sua oficina');
    await sendWhatsApp(phone, menu2);
    return new Response('ok', { status: 200 });
  }

  // ─── FLUXO DE VENDAS (Claude) ─────────────────────────────────────────────────
  history.push({ role: 'user', content: text });
  const recentHistory = history.slice(-20);

  let reply: string;
  try {
    reply = await callClaude(recentHistory);
  } catch {
    return new Response('ok', { status: 200 });
  }

  recentHistory.push({ role: 'assistant', content: reply });
  await sb.from('conversation_state').upsert({
    phone, state: 'conversando', data: { history: recentHistory },
  }, { onConflict: 'phone' });
  await sendWhatsApp(phone, reply);

  // Detecta comando de criar conta
  const criarMatch = reply.match(/^CRIAR_CONTA\|([^|]+)\|([^|]+)\|([^|]+)/m);
  if (criarMatch) {
    const [, nomeOficina, emailLead, tipoVeiculo] = criarMatch;
    const senha = Math.random().toString(36).slice(2, 10);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/provision-client`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
        body: JSON.stringify({
          company_name: nomeOficina.trim(),
          owner_email: emailLead.trim(),
          owner_password: senha,
          vehicle_type: tipoVeiculo.trim().toLowerCase().includes('carro') ? 'carro' : 'moto',
          is_trial: true,
        }),
      });
      const result = await res.json();
      if (result.success) {
        const msgConfirm = `✅ *Sua conta foi criada!*\n\n🔗 *Acesso:* https://app.speedseekos.com.br\n📧 *E-mail:* ${emailLead.trim()}\n🔑 *Senha:* ${senha}\n\nVocê tem *5 dias grátis* para testar tudo! 🚀\n\nNa primeira vez que entrar, vamos te guiar pela configuração. Qualquer dúvida é só chamar! 😊`;
        await sendWhatsApp(phone, msgConfirm);
        if (DONO_PHONE) await sendWhatsApp(DONO_PHONE, `🎉 *Nova conta via WhatsApp!*\n📱 ${phone}\n🏪 ${nomeOficina}\n📧 ${emailLead}\n🚗 ${tipoVeiculo}`);
        recentHistory[recentHistory.length - 1].content = msgConfirm;
        await sb.from('conversation_state').upsert({ phone, state: 'conta_criada', data: { history: recentHistory } }, { onConflict: 'phone' });
        return new Response('ok', { status: 200 });
      } else {
        await sendWhatsApp(phone, `Ops, tive um problema ao criar sua conta 😕\nVou avisar o responsável agora!`);
        if (DONO_PHONE) await sendWhatsApp(DONO_PHONE, `❌ Erro ao criar conta para ${phone}: ${result.error}`);
      }
    } catch (err) {
      console.error('Erro provision-client:', err);
      if (DONO_PHONE) await sendWhatsApp(DONO_PHONE, `❌ Erro crítico ao criar conta para ${phone}`);
    }
    return new Response('ok', { status: 200 });
  }

  // Alerta dono sobre lead quente
  const interessePalavras = ['fechar', 'contratar', 'assinar', 'quanto custa', 'quero comprar', 'vou pegar', 'quero assinar', 'vou assinar', 'quero fechar', 'quero o plano', 'como contrato', 'como assino'];
  if (interessePalavras.some(p => text.toLowerCase().includes(p)) && DONO_PHONE) {
    await sendWhatsApp(DONO_PHONE, `🔥 *Lead quente!*\n📱 ${phone}\n💬 "${text}"`);
  }

  return new Response('ok', { status: 200 });
});
