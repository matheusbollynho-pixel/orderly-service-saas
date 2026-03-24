/**
 * ia-atendimento
 * Cérebro principal da IA de atendimento da Bandara Motos via WhatsApp.
 * Usa Claude API (Anthropic) com tool_use para consultar o banco de dados.
 *
 * Módulos implementados:
 *  1. Identificação do cliente
 *  2. Consulta de OS
 *  3. Agendamento
 *  4. Consulta de peças (estoque + histórico balcão)
 *  5. Histórico do cliente
 *  6. FAQ (horário, endereço, formas de pagamento)
 *  7. Aprovação de orçamento
 *  8. OS pronta não buscada
 *  9. Satisfação (reenvio de link)
 * 10. Lembretes de manutenção
 * 12. Escalada humana
 * 13. Alertas internos para o dono
 */

import {
  getSupabaseClient,
  getConversationState,
  saveConversationState,
  buscarClientePorTelefone,
  buscarMotosDoCliente,
  buscarOSAtivaPorTelefone,
  buscarOSPorNome,
  buscarHistoricoOS,
  buscarMateriaisOS,
  buscarProdutoEstoque,
  buscarHistoricoBalcao,
  buscarHorariosDisponiveis,
  criarAgendamento,
  buscarStoreSettings,
  buscarUltimoServicoKeyword,
  buscarLinkSatisfacao,
  type ConversationContext,
  type StoreInfo,
} from '../_shared/database.ts';
import { sendWhatsAppText, sendWhatsAppLocation, normalizeBrPhone } from '../_shared/whatsapp.ts';

// ============================================================
// CONFIGURAÇÕES
// ============================================================

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || '';
const CLAUDE_MODEL = 'claude-sonnet-4-6';

// ============================================================
// TRADUÇÕES
// ============================================================

const STATUS_TRADUCAO: Record<string, string> = {
  aberta: 'acabou de entrar',
  em_andamento: 'em serviço',
  concluida: 'pronta para retirada ✅',
  concluida_entregue: 'já entregue',
};

const TURNO_LABEL: Record<string, string> = {
  MANHA: 'Manhã',
  TARDE: 'Tarde',
  manha: 'Manhã',
  tarde: 'Tarde',
};

// ============================================================
// ENVIO DE MENSAGEM E ALERTAS
// ============================================================

async function enviarMensagem(phone: string, texto: string): Promise<void> {
  await sendWhatsAppText(phone, texto);
}

async function enviarAlertaDono(resumo: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { data: settings } = await supabase
    .from('store_settings')
    .select('boleto_notify_phone_1, boleto_notify_phone_2')
    .limit(1)
    .maybeSingle();
  const phones = [settings?.boleto_notify_phone_1, settings?.boleto_notify_phone_2].filter(Boolean) as string[];
  if (phones.length === 0) return;
  const msg = `🔔 *Alerta IA Atendimento*\n\n${resumo}`;
  await Promise.allSettled(
    phones.map(p => sendWhatsAppText(normalizeBrPhone(p), msg).catch(e => console.error('Erro alerta dono:', e)))
  );
}

// ============================================================
// FERRAMENTAS DO CLAUDE (tool_use)
// ============================================================

const TOOLS = [
  {
    name: 'consultar_cliente',
    description: 'Busca o cadastro do cliente pelo número de telefone no banco de dados.',
    input_schema: {
      type: 'object',
      properties: {
        phone: { type: 'string', description: 'Número de telefone do cliente' },
      },
      required: ['phone'],
    },
  },
  {
    name: 'consultar_os',
    description: 'Busca a OS ativa mais recente do cliente pelo telefone.',
    input_schema: {
      type: 'object',
      properties: {
        phone: { type: 'string', description: 'Número de telefone do cliente' },
      },
      required: ['phone'],
    },
  },
  {
    name: 'consultar_os_por_nome',
    description: 'Busca OS pelo nome do cliente. Usar quando: (1) alguém pergunta sobre a moto de outra pessoa (ex: "a moto do Joselton está pronta?"), ou (2) o cliente não foi encontrado pelo telefone e forneceu o próprio nome para buscar histórico ou OS.',
    input_schema: {
      type: 'object',
      properties: {
        nome: { type: 'string', description: 'Nome ou parte do nome do cliente' },
      },
      required: ['nome'],
    },
  },
  {
    name: 'consultar_historico_cliente',
    description: 'Busca o histórico de OS anteriores e motos cadastradas do cliente. Requer client_id (obtido via consultar_cliente). Se não houver client_id, use consultar_os_por_nome para buscar pelo nome.',
    input_schema: {
      type: 'object',
      properties: {
        client_id: { type: 'string', description: 'ID do cliente' },
      },
      required: ['client_id'],
    },
  },
  {
    name: 'consultar_pecas',
    description: 'Busca peças/produtos no estoque formal (inventory_products). Retorna nome, quantidade disponível e preço.',
    input_schema: {
      type: 'object',
      properties: {
        descricao: { type: 'string', description: 'Descrição ou nome da peça que o cliente procura' },
      },
      required: ['descricao'],
    },
  },
  {
    name: 'consultar_historico_balcao',
    description: 'Busca peças no histórico de vendas do balcão (balcao_items). Usar SOMENTE se consultar_pecas não retornar resultados em estoque. NUNCA dizer "temos em estoque" para itens encontrados aqui.',
    input_schema: {
      type: 'object',
      properties: {
        descricao: { type: 'string', description: 'Descrição da peça buscada' },
      },
      required: ['descricao'],
    },
  },
  {
    name: 'consultar_agendamentos_disponiveis',
    description: 'Retorna os dias e turnos disponíveis para agendamento nos próximos 7 dias.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'criar_agendamento',
    description: 'Cria um novo agendamento para o cliente. Só chamar após confirmar todos os dados com o cliente.',
    input_schema: {
      type: 'object',
      properties: {
        client_name: { type: 'string' },
        client_phone: { type: 'string' },
        client_id: { type: 'string', description: 'ID do cliente (opcional)' },
        appointment_date: { type: 'string', description: 'Data no formato YYYY-MM-DD' },
        shift: { type: 'string', enum: ['manha', 'tarde'] },
        equipment: { type: 'string', description: 'Moto (marca/modelo/placa)' },
        service_description: { type: 'string', description: 'Descrição do serviço' },
      },
      required: ['client_name', 'client_phone', 'appointment_date', 'shift', 'equipment', 'service_description'],
    },
  },
  {
    name: 'consultar_store_settings',
    description: 'Busca informações da loja: nome, endereço, horário, telefone, formas de pagamento.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'enviar_localizacao',
    description: 'Envia o pin de localização da loja no mapa do WhatsApp. SEMPRE chamar quando o cliente perguntar o endereço ou como chegar.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'consultar_orcamento',
    description: 'Busca os materiais/serviços de uma OS para enviar orçamento ao cliente.',
    input_schema: {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: 'ID da OS' },
      },
      required: ['order_id'],
    },
  },
  {
    name: 'consultar_link_satisfacao',
    description: 'Busca o link de pesquisa de satisfação de uma OS para reenviar ao cliente.',
    input_schema: {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: 'ID da OS' },
      },
      required: ['order_id'],
    },
  },
  {
    name: 'consultar_lembrete_manutencao',
    description: 'Verifica se o cliente está no prazo de manutenção para um serviço específico (ex: troca de óleo).',
    input_schema: {
      type: 'object',
      properties: {
        client_id: { type: 'string' },
        keyword: { type: 'string', description: 'Serviço a verificar (ex: oleo, revisao, corrente)' },
      },
      required: ['client_id', 'keyword'],
    },
  },
  {
    name: 'escalar_humano',
    description: 'Escala o atendimento para um humano quando necessário. Notifica o dono e muda o estado da conversa.',
    input_schema: {
      type: 'object',
      properties: {
        phone: { type: 'string', description: 'Telefone do cliente' },
        motivo: { type: 'string', description: 'Motivo da escalada' },
        client_name: { type: 'string', description: 'Nome do cliente (se conhecido)' },
      },
      required: ['phone', 'motivo'],
    },
  },
];

// ============================================================
// EXECUTAR FERRAMENTAS
// ============================================================

async function executarFerramenta(
  sb: ReturnType<typeof getSupabaseClient>,
  tool: string,
  input: Record<string, unknown>,
  phone: string,
  conversationContext: ConversationContext
): Promise<unknown> {
  console.log(`🔧 Executando ferramenta: ${tool}`, input);

  switch (tool) {
    case 'consultar_cliente': {
      const cliente = await buscarClientePorTelefone(sb, input.phone as string);
      if (!cliente) return { encontrado: false };
      const motos = await buscarMotosDoCliente(sb, cliente.id);
      return { encontrado: true, ...cliente, motos };
    }

    case 'consultar_os': {
      const os = await buscarOSAtivaPorTelefone(sb, input.phone as string);
      if (!os) return { encontrado: false };
      const statusTraduzido = STATUS_TRADUCAO[os.status || ''] || os.status;
      return { ...os, status_traduzido: statusTraduzido };
    }

    case 'consultar_os_por_nome': {
      const ordens = await buscarOSPorNome(sb, input.nome as string);
      if (ordens.length === 0) return { encontrado: false };
      return {
        encontrado: true,
        ordens: ordens.map((os) => ({
          ...os,
          status_traduzido: STATUS_TRADUCAO[os.status || ''] || os.status,
        })),
      };
    }

    case 'consultar_historico_cliente': {
      const motos = await buscarMotosDoCliente(sb, input.client_id as string);
      const historico = await buscarHistoricoOS(sb, input.client_id as string);
      return { motos, historico };
    }

    case 'consultar_pecas': {
      const produtos = await buscarProdutoEstoque(sb, input.descricao as string);
      return { encontrado: produtos.length > 0, produtos };
    }

    case 'consultar_historico_balcao': {
      const historico = await buscarHistoricoBalcao(sb, input.descricao as string);
      return { encontrado: historico.length > 0, historico };
    }

    case 'consultar_agendamentos_disponiveis': {
      const disponiveis = await buscarHorariosDisponiveis(sb);
      return { disponiveis };
    }

    case 'criar_agendamento': {
      const result = await criarAgendamento(sb, {
        client_name: input.client_name as string,
        client_phone: input.client_phone as string,
        client_id: (input.client_id as string) || conversationContext.client_id || null,
        appointment_date: input.appointment_date as string,
        shift: input.shift as string,
        equipment: input.equipment as string,
        service_description: input.service_description as string,
      });
      if (result) {
        const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
        fetch(`${supabaseUrl}/functions/v1/send-appointment-confirmation`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
          body: JSON.stringify({
            client_name: input.client_name,
            client_phone: input.client_phone,
            appointment_date: input.appointment_date,
            shift: input.shift,
            equipment: input.equipment,
            service_description: input.service_description,
          }),
        }).catch((e) => console.error('Erro ao enviar confirmação:', e));
      }
      return { criado: !!result, agendamento_id: result?.id };
    }

    case 'consultar_store_settings': {
      return await buscarStoreSettings(sb);
    }

    case 'enviar_localizacao': {
      await sendWhatsAppLocation(
        normalizeBrPhone(phone),
        -9.444226,
        -38.222471,
        'Bandara Motos',
        'Rodovia BA-210, 913A, BTN II, Paulo Afonso-BA'
      );
      return { enviado: true };
    }

    case 'consultar_orcamento': {
      const materiais = await buscarMateriaisOS(sb, input.order_id as string);
      const total = materiais.reduce((acc, m) => acc + (m.valor || 0) * m.quantidade, 0);
      return { materiais, total };
    }

    case 'consultar_link_satisfacao': {
      const link = await buscarLinkSatisfacao(sb, input.order_id as string);
      return { link };
    }

    case 'consultar_lembrete_manutencao': {
      const lembrete = await buscarUltimoServicoKeyword(sb, input.client_id as string, input.keyword as string);
      if (!lembrete) return { encontrado: false };
      const serviceDate = new Date(lembrete.service_date);
      const diasPassados = Math.floor((Date.now() - serviceDate.getTime()) / (1000 * 60 * 60 * 24));
      const vencido = diasPassados >= lembrete.reminder_days;
      return {
        encontrado: true,
        dias_passados: diasPassados,
        prazo_dias: lembrete.reminder_days,
        vencido,
        service_date: lembrete.service_date,
        reminder_message: lembrete.reminder_message || null,
      };
    }

    case 'escalar_humano': {
      const motivo = input.motivo as string;
      const nome = (input.client_name as string) || conversationContext.client_name || 'Cliente';

      // Salvar estado como aguardando humano
      await saveConversationState(sb, input.phone as string, 'aguardando_humano', {
        ...conversationContext,
        escalada_motivo: motivo,
      });

      // Alertar dono
      await enviarAlertaDono(
        `👤 *${nome}* (${input.phone}) precisa de atendimento humano.\n\n📋 *Motivo:* ${motivo}`
      );

      return { escalado: true };
    }

    default:
      return { erro: `Ferramenta desconhecida: ${tool}` };
  }
}

// ============================================================
// CHAMAR CLAUDE API
// ============================================================

async function chamarClaude(
  systemPrompt: string,
  messages: { role: 'user' | 'assistant'; content: string | unknown[] }[]
): Promise<{ content: unknown[]; stop_reason: string }> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      tools: TOOLS,
      messages,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error ${response.status}: ${err}`);
  }

  return response.json();
}

// ============================================================
// SYSTEM PROMPT
// ============================================================

function buildSystemPrompt(store: StoreInfo, clienteNome?: string): string {
  const nome = clienteNome ? `O cliente se chama ${clienteNome}.` : '';
  const horario = store.opening_hours || store.store_hours || 'Segunda a sexta: 8h às 18h | Sábado: 8h às 14h';
  const pagamentos = store.payment_methods || store.accepted_payments || 'Pix, Dinheiro, Cartão';
  const endereco = store.store_address || '';
  const telefone = store.store_phone || '';
  const obs = store.ai_notes || '';
  return `Você é o atendente virtual da ${store.company_name}, uma oficina de motos em Paulo Afonso-BA.
Seu nome é "Assistente ${store.company_name}".

${nome}

## INFORMAÇÕES DA LOJA
- *Endereço:* ${endereco || 'Rodovia BA 210, 913A, BTN II, Paulo Afonso-BA'}
- *Telefone:* ${telefone || '75988046356'}
- *Horário:* ${horario}
- *Formas de pagamento:* ${pagamentos}
${obs ? `- *Observações:* ${obs}` : ''}
- *Capacidade de agendamento:* Aceitamos até ${store.max_agendamentos_dia} motos por dia (${Math.ceil(store.max_agendamentos_dia / 2)} pela manhã e ${Math.ceil(store.max_agendamentos_dia / 2)} à tarde)
- *Serviços:* Realizamos TODOS os serviços para motos, exceto remendo de pneu. Se o cliente perguntar sobre qualquer serviço (desempanar chassis, freios, motor, elétrica, funilaria, etc.), confirme que sim, fazemos!

## REGRAS DE COMPORTAMENTO
- Linguagem informal, amigável e direta — como um atendente real de oficina nordestina
- FORMATAÇÃO: use APENAS formatação WhatsApp: *negrito* (asterisco simples), _itálico_ (underscore). NUNCA use **duplo asterisco**, nunca use markdown como ##, >, -, *, backtick, etc.
- Sempre que apresentar mais de uma opção ao cliente, use numeração: *1 -* opção, *2 -* opção, etc. Nunca use lista com traço ou ponto.
- Nunca invente dados — se não encontrar, diga claramente
- Nunca prometa estoque sem verificar inventory_products primeiro
- Use o apelido do cliente sempre que disponível
- Respostas curtas e objetivas — máximo 3-4 linhas por mensagem
- Se der erro inesperado, responda: "Deixa eu chamar nossa equipe!" e escale para humano
- NUNCA sugira ao cliente ligar ou mandar mensagem para o número da loja — ele já está falando pelo WhatsApp da loja. Quando precisar de atendimento humano, use escalar_humano ou diga que vai chamar um atendente aqui mesmo

## MÓDULOS QUE VOCÊ COBRE
1. Status de OS do cliente
2. Agendamento (consulta de horários e criação)
3. Consulta de peças no estoque
4. Histórico de serviços do cliente
5. Informações da loja (horário, endereço, formas de pagamento)
6. Aprovação de orçamento (materiais de OS aguardando)
7. Reenvio de link de avaliação
8. Prazo de manutenção (se está na hora de trocar óleo, etc.) — ao responder, use o campo reminder_message do resultado como base para explicar o serviço ao cliente, adaptando para o contexto atual (data do último serviço, dias restantes). Não use mensagens genéricas.

## FLUXO DE AGENDAMENTO
- Se o cliente quer agendar, siga este fluxo independente de estar cadastrado ou não:
  1. Pergunte o nome (se ainda não souber)
  2. Chame consultar_agendamentos_disponiveis para ver os horários livres
  3. Pergunte qual moto (marca/modelo/placa)
  4. Pergunte qual serviço
  5. Mostre um resumo completo e pergunte "Confirma?"
  6. SOMENTE após o cliente responder SIM → chame criar_agendamento imediatamente
  7. Após criar, confirme com "✅ Agendamento marcado!"
- NUNCA chame criar_agendamento antes do cliente confirmar com SIM
- NUNCA abandone o fluxo de agendamento só porque o cliente não está cadastrado — use o nome e telefone informados
- Se o cliente quiser agendar para HOJE: informe que para o mesmo dia é necessário falar diretamente com um atendente para verificar encaixe, e ofereça chamar um atendente aqui mesmo no chat (use escalar_humano)

## LOCALIZAÇÃO
- Quando o cliente perguntar o endereço ou como chegar: SEMPRE chame enviar_localizacao para enviar o pin no mapa, além de informar o endereço no texto

## REGRAS DE PEÇAS
- Para QUALQUER pergunta sobre peças, preços ou disponibilidade: responda apenas que vai encaminhar para o setor responsável
- NÃO tente buscar no estoque do sistema e NÃO use escalar_humano
- Mensagem padrão: "Sobre peças e preços, vou encaminhar sua pergunta para nosso setor responsável! Em breve eles entrarão em contato 😊"

## ESCALAR PARA HUMANO quando:
- Cliente reclama de serviço realizado
- Pagamento com problema
- Peça não encontrada em nenhuma fonte
- Mais de 3 trocas sem resolver
- Cliente pede explicitamente falar com humano
- Cliente recusa orçamento

## ESTADO DA CONVERSA
- Se o estado for "aguardando_humano", informe que um atendente já foi avisado e vai responder em breve
- Não tente resolver nada no estado "aguardando_humano"
- Se o estado for "menu_apresentado", o cliente acabou de ver o menu de opções (1-Loja/Peças, 2-Oficina, 3-Agendamento, 4-Localização). Interprete a resposta dele e direcione para o módulo correto sem repetir o menu

## TRADUÇÕES DE STATUS DE OS
- aberta → "acabou de entrar"
- em_andamento → "em serviço"
- concluida → "pronta para retirada ✅"
- concluida_entregue → "já entregue"

Hoje é ${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}.`;
}

// ============================================================
// HANDLER PRINCIPAL
// ============================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 204, headers: { 'Access-Control-Allow-Origin': '*' } });
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const sb = getSupabaseClient();

  let phone = '';
  let text = '';
  let senderName = '';

  try {
    const body = await req.json();
    phone = (body.phone as string || '').replace(/\D/g, '');
    text = (body.text as string || '').trim();
    senderName = (body.sender_name as string || '');

    if (!phone || !text) {
      return new Response(JSON.stringify({ error: 'phone e text são obrigatórios' }), { status: 400 });
    }

    console.log(`🤖 IA processando mensagem de ${phone}: "${text.slice(0, 80)}"`);

    // ----------------------------------------------------------
    // 0. Verificar se a IA está ativada
    // ----------------------------------------------------------
    const { data: settings } = await sb
      .from('store_settings')
      .select('ai_enabled')
      .limit(1)
      .maybeSingle();
    if (settings && (settings as Record<string, unknown>).ai_enabled === false) {
      console.log('⏸️ IA pausada (ai_enabled=false)');
      return new Response(JSON.stringify({ ok: true, paused: true }), { status: 200 });
    }

    // ----------------------------------------------------------
    // 1. Carregar estado da conversa
    // ----------------------------------------------------------
    const { state, context: convCtx } = await getConversationState(sb, phone);
    const ctx: ConversationContext = convCtx;

    // ----------------------------------------------------------
    // 2. Se aguardando humano, não processar pela IA
    // ----------------------------------------------------------
    if (state === 'aguardando_humano') {
      await enviarMensagem(
        normalizeBrPhone(phone),
        '⏳ Seu atendimento está com nossa equipe. Em breve um atendente vai responder!'
      );
      return new Response(JSON.stringify({ ok: true, state: 'aguardando_humano' }), { status: 200 });
    }

    // (step 3 removido — agendamento criado diretamente pelo tool após confirmação via histórico)

    // ----------------------------------------------------------
    // 4. Verificar resposta de lembrete de agendamento (confirmação 1 dia antes)
    // ----------------------------------------------------------
    if (state === 'confirmacao_lembrete' && ctx.lembrete_agendamento_id) {
      const resp = text.toLowerCase().trim();
      if (resp === 'sim' || resp === 's' || resp.includes('confirm') || resp.includes('ok')) {
        await sb.from('appointments')
          .update({ status: 'confirmado', confirmado_pelo_cliente: true, confirmacao_respondida_em: new Date().toISOString() })
          .eq('id', ctx.lembrete_agendamento_id);
        await saveConversationState(sb, phone, 'identificado', { ...ctx, lembrete_agendamento_id: undefined });
        await enviarMensagem(normalizeBrPhone(phone), '✅ Confirmado! Te esperamos amanhã 🏍️');
      } else if (resp === 'nao' || resp === 'não' || resp === 'n') {
        await sb.from('appointments')
          .update({ status: 'cancelado', confirmado_pelo_cliente: false, confirmacao_respondida_em: new Date().toISOString() })
          .eq('id', ctx.lembrete_agendamento_id);
        await saveConversationState(sb, phone, 'identificado', { ...ctx, lembrete_agendamento_id: undefined });
        await enviarMensagem(normalizeBrPhone(phone), 'Entendido! Agendamento cancelado. Quando quiser remarcar é só chamar 😊');
        await enviarAlertaDono(`❌ Agendamento cancelado pelo cliente\n📱 ${phone}\nID: ${ctx.lembrete_agendamento_id}`);
      } else {
        await saveConversationState(sb, phone, 'identificado', { ...ctx, lembrete_agendamento_id: undefined });
        // Deixar Claude processar
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    // ----------------------------------------------------------
    // 5. Verificar aprovação de orçamento (SIM/NÃO)
    // ----------------------------------------------------------
    if (state === 'aguardando_aprovacao_orcamento' && ctx.pending_orcamento_order_id) {
      const resp = text.toLowerCase().trim();
      const aprovado = resp === 'sim' || resp === 's' || resp === '1' || resp.includes('aprovo') || resp.includes('ok');
      const recusado = resp === 'nao' || resp === 'não' || resp === 'n' || resp === '2' || resp.includes('recus') || resp.includes('cancel');

      if (aprovado) {
        await saveConversationState(sb, phone, 'identificado', { ...ctx, pending_orcamento_order_id: undefined });
        await enviarMensagem(normalizeBrPhone(phone), '✅ Orçamento aprovado! Vou passar para nossa equipe agora.');
        await enviarAlertaDono(
          `✅ *Orçamento APROVADO*\n📱 ${ctx.client_name || phone}\nOS: ${ctx.pending_orcamento_order_id}`
        );
      } else if (recusado) {
        await saveConversationState(sb, phone, 'identificado', { ...ctx, pending_orcamento_order_id: undefined });
        await enviarMensagem(normalizeBrPhone(phone), 'Entendido. Vou avisar nossa equipe sobre a recusa do orçamento.');
        await enviarAlertaDono(
          `❌ *Orçamento RECUSADO*\n📱 ${ctx.client_name || phone}\nOS: ${ctx.pending_orcamento_order_id}`
        );
        await executarFerramenta(sb, 'escalar_humano', {
          phone,
          motivo: `Cliente recusou orçamento da OS ${ctx.pending_orcamento_order_id}`,
          client_name: ctx.client_name,
        }, phone, ctx);
      }

      if (aprovado || recusado) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
    }

    // ----------------------------------------------------------
    // 6. Buscar info da loja para o system prompt
    // ----------------------------------------------------------
    const store = await buscarStoreSettings(sb);

    // ----------------------------------------------------------
    // 6.1 Primeiro contato — enviar menu de boas-vindas
    // ----------------------------------------------------------
    if (state === 'novo') {
      const menuBoasVindas =
        `Olá! 👋 Bem-vindo à *${store.company_name}*!\n\n` +
        `Sou o Assistente virtual e estou aqui pra te ajudar 😊\n\n` +
        `O que você precisa hoje?\n\n` +
        `🛒 *1 - Loja / Peças*\n` +
        `_Consultar peças e produtos_\n\n` +
        `🔧 *2 - Oficina*\n` +
        `_Status de OS, orçamento, aprovação_\n\n` +
        `📅 *3 - Agendamento*\n` +
        `_Marcar ou consultar serviço_\n\n` +
        `📍 *4 - Localização e horários*\n\n` +
        `É só responder com o número ou me contar o que precisa! 🏍️`;

      await enviarMensagem(normalizeBrPhone(phone), menuBoasVindas);
      await saveConversationState(sb, phone, 'menu_apresentado', ctx);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    // ----------------------------------------------------------
    // 7. Montar mensagens para o Claude (com histórico)
    // ----------------------------------------------------------
    const systemPrompt = buildSystemPrompt(store, ctx.client_name);

    // Contexto resumido da conversa para o Claude
    const contextSummary = ctx.client_name
      ? `[Contexto: cliente identificado como "${ctx.client_name}" (${ctx.apelido || ''}), id=${ctx.client_id || 'desconhecido'}, estado=${state}]`
      : `[Contexto: cliente ainda não identificado, telefone=${phone}, estado=${state}]`;

    // Histórico das últimas mensagens (máx 8 turnos = 16 mensagens)
    type HistoryEntry = { role: 'user' | 'assistant'; text: string };
    const history: HistoryEntry[] = (ctx.history as HistoryEntry[] | undefined) || [];

    const messages: { role: 'user' | 'assistant'; content: string | unknown[] }[] = [];

    // Primeira mensagem sempre tem o contexto do sistema
    if (history.length === 0) {
      messages.push({ role: 'user', content: `${contextSummary}\n\nMensagem do cliente: ${text}` });
    } else {
      // Primeira mensagem do histórico inclui o contexto
      messages.push({ role: 'user', content: `${contextSummary}\n\nMensagem do cliente: ${history[0].text}` });
      for (let i = 1; i < history.length; i++) {
        messages.push({ role: history[i].role, content: history[i].text });
      }
      // Mensagem atual do cliente
      messages.push({ role: 'user', content: text });
    }

    // ----------------------------------------------------------
    // 8. Loop de tool_use com o Claude
    // ----------------------------------------------------------
    let finalResponse = '';
    let newState = state === 'novo' ? 'identificando' : state;
    let loopCount = 0;
    const MAX_LOOPS = 5;

    while (loopCount < MAX_LOOPS) {
      loopCount++;

      let claudeResult: { content: unknown[]; stop_reason: string };
      try {
        claudeResult = await chamarClaude(systemPrompt, messages);
      } catch (e) {
        console.error('Erro ao chamar Claude:', e);
        throw e;
      }

      const { content, stop_reason } = claudeResult;

      // Adicionar resposta do assistente ao histórico
      messages.push({ role: 'assistant', content });

      // Se parou por end_turn, extrair texto da resposta
      if (stop_reason === 'end_turn') {
        const textBlock = (content as { type: string; text?: string }[]).find((b) => b.type === 'text');
        finalResponse = textBlock?.text || '';
        break;
      }

      // Se parou por tool_use, executar ferramentas
      if (stop_reason === 'tool_use') {
        const toolUses = (content as { type: string; name?: string; id?: string; input?: Record<string, unknown> }[])
          .filter((b) => b.type === 'tool_use');

        const toolResults: unknown[] = [];

        for (const toolUse of toolUses) {
          const toolName = toolUse.name!;
          const toolInput = toolUse.input || {};

          // Atualizar contexto baseado nos resultados das ferramentas
          if (toolName === 'criar_agendamento') {
            newState = 'identificado';
          }

          if (toolName === 'escalar_humano') {
            newState = 'aguardando_humano';
          }

          let result: unknown;
          try {
            result = await executarFerramenta(sb, toolName, toolInput, phone, ctx);
          } catch (e) {
            console.error(`Erro na ferramenta ${toolName}:`, e);
            result = { erro: String(e) };
          }

          // Atualizar contexto com dados do cliente se identificado
          if (toolName === 'consultar_cliente' && (result as Record<string, unknown>).encontrado) {
            const r = result as Record<string, unknown>;
            ctx.client_id = r.id as string;
            ctx.client_name = r.name as string;
            ctx.apelido = (r.apelido as string) || undefined;
            newState = 'identificado';
          }

          // Verificar se OS está aguardando aprovação de orçamento
          if (toolName === 'consultar_os' && (result as Record<string, unknown>).encontrado) {
            const r = result as Record<string, unknown>;
            if (r.status === 'aguardando_aprovacao') {
              ctx.pending_orcamento_order_id = r.id as string;
              newState = 'aguardando_aprovacao_orcamento';
            }
          }

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify(result),
          });
        }

        // Adicionar resultados das ferramentas ao histórico
        messages.push({ role: 'user', content: toolResults });
        continue;
      }

      // Outro stop_reason inesperado
      break;
    }

    // ----------------------------------------------------------
    // 9. Verificar alertas especiais na resposta
    // ----------------------------------------------------------

    // Se OS concluída (pronta para retirada), alertar dono se não foi alertado ainda
    if (finalResponse.toLowerCase().includes('pronta para retirada')) {
      const os = await buscarOSAtivaPorTelefone(sb, phone);
      if (os?.status === 'concluido' && !os.aviso_retirada_enviado_em) {
        // os-pronta-aviso vai lidar com isso — não duplicar aqui
      }
    }

    // Verificar satisfação <= 2 (monitorada via satisfaction_ratings separadamente)

    // ----------------------------------------------------------
    // 10. Salvar estado atualizado (com histórico)
    // ----------------------------------------------------------
    if (newState !== 'aguardando_humano') {
      // Atualizar histórico: adicionar mensagem do cliente e resposta da IA
      const updatedHistory: { role: 'user' | 'assistant'; text: string }[] = [
        ...history,
        { role: 'user', text },
        ...(finalResponse ? [{ role: 'assistant' as const, text: finalResponse }] : []),
      ];
      // Manter apenas os últimos 8 turnos (16 mensagens) para não inflar o contexto
      ctx.history = updatedHistory.slice(-16);
      await saveConversationState(sb, phone, newState, ctx);
    }

    // ----------------------------------------------------------
    // 11. Enviar resposta ao cliente
    // ----------------------------------------------------------
    if (finalResponse) {
      console.log(`📤 Enviando para ${normalizeBrPhone(phone)}: "${finalResponse.slice(0, 100)}"`);
      await enviarMensagem(normalizeBrPhone(phone), finalResponse);
      console.log('✅ Mensagem enviada ao cliente');
    } else {
      // Fallback — nunca deixar o cliente sem resposta
      await enviarMensagem(
        normalizeBrPhone(phone),
        'Deixa eu chamar nossa equipe! Um momento 😊'
      );
      await enviarAlertaDono(`⚠️ IA sem resposta para ${phone}: "${text.slice(0, 100)}"`);
    }

    return new Response(JSON.stringify({ ok: true, state: newState }), { status: 200 });

  } catch (error) {
    console.error('❌ Erro geral na ia-atendimento:', error);

    // Fallback universal — nunca deixar o cliente sem resposta
    try {
      if (phone) {
        await enviarMensagem(
          normalizeBrPhone(phone),
          'Deixa eu chamar nossa equipe! Um momento 😊'
        );
        await enviarAlertaDono(`❌ Erro na IA de atendimento\n📱 ${phone}\n💬 "${text?.slice(0, 100)}"\n\nErro: ${String(error)}`);
        // Marcar como aguardando humano
        const sb2 = getSupabaseClient();
        await saveConversationState(sb2, phone, 'aguardando_humano', { escalada_motivo: 'Erro interno da IA' });
      }
    } catch (fallbackError) {
      console.error('Erro no fallback:', fallbackError);
    }

    return new Response(JSON.stringify({ error: String(error) }), { status: 500 });
  }
});
