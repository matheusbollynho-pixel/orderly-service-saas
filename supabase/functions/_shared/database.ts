/**
 * _shared/database.ts
 * Helpers de banco de dados compartilhados entre Edge Functions da IA.
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export function getSupabaseClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(url, key);
}

// ============================================================
// CONVERSATION STATE
// ============================================================

export interface ConversationContext {
  client_id?: string;
  client_name?: string;
  apelido?: string;
  state?: string;
  history?: { role: 'user' | 'assistant'; text: string }[];
  pending_appointment?: {
    date?: string;
    shift?: string;
    equipment?: string;
    service?: string;
  };
  pending_orcamento_order_id?: string;
  escalada_motivo?: string;
  lembrete_agendamento_id?: string;
  os_id?: string;
  os_total_pendente?: number;
  os_total_pago?: number;
  os_materiais?: { descricao: string; valor: number; quantidade: number }[];
  cpf_pix_temp?: string;
  humano_assumiu_em?: string;
  loop_ultima_resposta_em?: string;
  loop_respostas_rapidas_seguidas?: number;
  loop_pausado_em?: string;
}

export async function getConversationState(
  sb: SupabaseClient,
  phone: string
): Promise<{ state: string; context: ConversationContext }> {
  const clean = phone.replace(/\D/g, '');
  // Gera variantes com/sem 55 e com/sem o 9 extra
  const variants = new Set<string>([clean]);
  const sem55 = clean.startsWith('55') ? clean.slice(2) : clean;
  variants.add(sem55);
  variants.add(`55${sem55}`);
  // Com e sem o 9 (após DDD de 2 dígitos)
  if (sem55.length === 11 && sem55[2] === '9') {
    const sem9 = sem55.slice(0, 2) + sem55.slice(3);
    variants.add(sem9);
    variants.add(`55${sem9}`);
  } else if (sem55.length === 10) {
    const com9 = sem55.slice(0, 2) + '9' + sem55.slice(2);
    variants.add(com9);
    variants.add(`55${com9}`);
  }

  const { data } = await sb
    .from('conversation_state')
    .select('state, context')
    .in('phone', [...variants])
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return { state: 'novo', context: {} };
  return { state: data.state, context: (data.context as ConversationContext) || {} };
}

export async function saveConversationState(
  sb: SupabaseClient,
  phone: string,
  state: string,
  context: ConversationContext,
  storeId?: string
): Promise<void> {
  // Se não passou storeId, tenta buscar da tabela ou usar o primeiro disponível
  let resolvedStoreId = storeId;
  if (!resolvedStoreId) {
    // Tenta pegar o store_id existente para este phone
    const { data: existing } = await sb
      .from('conversation_state')
      .select('store_id')
      .eq('phone', phone)
      .maybeSingle();
    if (existing?.store_id) {
      resolvedStoreId = existing.store_id;
    } else {
      // Fallback: primeiro store disponível
      const { data: store } = await sb
        .from('store_settings')
        .select('id')
        .limit(1)
        .maybeSingle();
      resolvedStoreId = store?.id;
    }
  }

  const { error } = await sb.from('conversation_state').upsert(
    { phone, state, context, store_id: resolvedStoreId, updated_at: new Date().toISOString() },
    { onConflict: 'phone' }
  );
  if (error) console.error(`❌ saveConversationState error (state=${state}):`, error.message, error.hint);
}

export async function clearConversationState(sb: SupabaseClient, phone: string): Promise<void> {
  await sb.from('conversation_state').delete().eq('phone', phone);
}

// ============================================================
// CLIENTE
// ============================================================

export interface ClienteRow {
  id: string;
  name: string;
  apelido: string | null;
  phone: string | null;
  cpf: string | null;
  autoriza_lembretes: boolean | null;
}

export async function buscarClientePorTelefone(
  sb: SupabaseClient,
  phone: string,
  storeId?: string
): Promise<ClienteRow | null> {
  const clean = phone.replace(/\D/g, '');
  const sem55 = clean.startsWith('55') ? clean.slice(2) : clean;

  // Tenta também sem o dígito 9 (formato antigo BR: área+9+8dígitos → área+8dígitos)
  // Ex: 75988388629 (11 dígitos) → 7588388629 (10 dígitos)
  const sem9 = (sem55.length === 11 && sem55[2] === '9')
    ? sem55.slice(0, 2) + sem55.slice(3)
    : sem55;

  // Últimos 8 dígitos — funciona independente de formato (com/sem 9, com/sem 55)
  const ultimos8 = sem55.slice(-8);

  const filtros = [
    `phone.ilike.%${sem55}%`,
    ...(sem9 !== sem55 ? [`phone.ilike.%${sem9}%`] : []),
    `phone.ilike.%${ultimos8}%`,
  ];

  let query = sb
    .from('clients')
    .select('id, name, apelido, phone, cpf, autoriza_lembretes')
    .or(filtros.join(','));

  if (storeId) query = query.eq('store_id', storeId);

  const { data, error } = await query.limit(1).maybeSingle();

  if (error) console.error('❌ buscarCliente error:', error.message);
  return data as ClienteRow | null;
}

export async function buscarMotosDoCliente(
  sb: SupabaseClient,
  clientId: string
): Promise<{ placa: string; marca: string; modelo: string; ano: string; cor: string }[]> {
  const { data } = await sb
    .from('motorcycles')
    .select('placa, marca, modelo, ano, cor')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });

  return (data as { placa: string; marca: string; modelo: string; ano: string; cor: string }[]) || [];
}

// ============================================================
// ORDENS DE SERVIÇO
// ============================================================

export interface OSRow {
  id: string;
  client_name: string;
  equipment: string | null;
  status: string | null;
  status_oficina: string | null;
  mechanic_id: string | null;
  mechanic_name: string | null;
  entry_date: string | null;
  conclusion_date: string | null;
  problem_description: string | null;
  satisfaction_survey_sent_at: string | null;
  aviso_retirada_enviado_em: string | null;
  total_pago: number | null;
  total_pendente: number | null;
  materiais: { descricao: string; valor: number; quantidade: number }[];
}

export async function buscarOSAtivaPorTelefone(
  sb: SupabaseClient,
  phone: string,
  storeId?: string
): Promise<OSRow | null> {
  const clean = phone.replace(/\D/g, '');
  const sem55 = clean.startsWith('55') ? clean.slice(2) : clean;

  const statusAtivos = ['aberta', 'em_andamento', 'concluida', 'concluida_entregue'];

  // Gera variantes com/sem o 9 após o DDD
  const extra9variants: string[] = [];
  if (sem55.length === 11 && sem55[2] === '9') {
    // Remove o 9: 11 → 10 dígitos
    extra9variants.push(sem55.slice(0, 2) + sem55.slice(3));
  } else if (sem55.length === 10) {
    // Adiciona o 9: 10 → 11 dígitos
    extra9variants.push(sem55.slice(0, 2) + '9' + sem55.slice(2));
  }

  const ultimos8os = sem55.slice(-8);

  const phoneVariants = [
    sem55,
    ...extra9variants,
    ultimos8os,
  ];

  let osId: string | null = null;

  for (const variant of phoneVariants) {
    let idQuery = sb
      .from('service_orders')
      .select('id, status')
      .eq('client_phone', variant);
    if (storeId) idQuery = idQuery.eq('store_id', storeId);
    const { data: idRows, error: idErr } = await idQuery.order('entry_date', { ascending: false }).limit(5);
    if (idErr) console.error('❌ buscarOS query error:', idErr.message);
    const activeRow = (idRows || []).find(r => statusAtivos.includes((r as Record<string,unknown>).status as string));
    if (activeRow) {
      osId = (activeRow as Record<string, unknown>).id as string;
      break;
    }
  }

  if (!osId) return null;

  // Busca dados completos da OS pelo ID
  const { data, error: osErr } = await sb
    .from('service_orders')
    .select('id, client_name, client_id, equipment, status, entry_date')
    .eq('id', osId)
    .maybeSingle();

  if (osErr) console.error('❌ buscarOS full data error:', osErr.message);
  if (!data) return null;

  const row = data as Record<string, unknown>;
  const osId2 = row.id as string;

  // Busca total pago na tabela payments
  const { data: paymentsData } = await sb
    .from('payments')
    .select('amount')
    .eq('order_id', osId2);
  const totalPago = ((paymentsData as { amount: number }[]) || [])
    .reduce((s, p) => s + (p.amount || 0), 0);

  return {
    id: osId2,
    client_name: row.client_name as string,
    equipment: row.equipment as string | null,
    status: row.status as string | null,
    status_oficina: null,
    mechanic_id: row.client_id as string | null,
    mechanic_name: null,
    entry_date: row.entry_date as string | null,
    conclusion_date: null,
    problem_description: null,
    satisfaction_survey_sent_at: null,
    aviso_retirada_enviado_em: null,
    total_pago: totalPago,
    total_pendente: 0,
    materiais: [],
  };
}

export async function buscarOSPorNome(
  sb: SupabaseClient,
  nome: string,
  storeId?: string
): Promise<OSRow[]> {
  const nomeLimpo = nome.trim();
  if (!nomeLimpo) return [];

  let query = sb
    .from('service_orders')
    .select(`id, client_name, equipment, status, status_oficina, mechanic_id, entry_date, conclusion_date, problem_description, satisfaction_survey_sent_at`)
    .ilike('client_name', `%${nomeLimpo}%`);

  if (storeId) query = query.eq('store_id', storeId);

  const { data, error: nomeErr } = await query.order('entry_date', { ascending: false }).limit(3);
  if (nomeErr) console.error('❌ buscarOSPorNome error:', nomeErr.message);

  if (!data) return [];

  return (data as Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    client_name: row.client_name as string,
    equipment: row.equipment as string | null,
    status: row.status as string | null,
    status_oficina: row.status_oficina as string | null,
    mechanic_id: row.mechanic_id as string | null,
    mechanic_name: null,
    entry_date: row.entry_date as string | null,
    conclusion_date: row.conclusion_date as string | null,
    problem_description: row.problem_description as string | null,
    satisfaction_survey_sent_at: row.satisfaction_survey_sent_at as string | null,
    aviso_retirada_enviado_em: null,
    total_pago: 0,
    total_pendente: 0,
    materiais: [],
  }));
}

export async function buscarHistoricoOS(
  sb: SupabaseClient,
  clientId: string,
  limite = 3
): Promise<{ equipment: string | null; status: string | null; entry_date: string | null; materials_summary: string }[]> {
  const { data: ordens } = await sb
    .from('service_orders')
    .select('id, equipment, status, entry_date')
    .eq('client_id', clientId)
    .order('entry_date', { ascending: false })
    .limit(limite);

  if (!ordens) return [];

  const result = [];
  for (const os of ordens as { id: string; equipment: string | null; status: string | null; entry_date: string | null }[]) {
    const { data: mats } = await sb
      .from('materials')
      .select('descricao')
      .eq('order_id', os.id)
      .limit(5);

    const summary = (mats as { descricao: string }[] | null)
      ?.map((m) => m.descricao)
      .filter(Boolean)
      .join(', ') || '';

    result.push({ ...os, materials_summary: summary });
  }

  return result;
}

export async function buscarMateriaisOS(
  sb: SupabaseClient,
  orderId: string
): Promise<{ descricao: string; quantidade: number; valor: number | null; is_service: boolean }[]> {
  const { data } = await sb
    .from('materials')
    .select('descricao, quantidade, valor, is_service')
    .eq('order_id', orderId);

  return (data as { descricao: string; quantidade: number; valor: number | null; is_service: boolean }[]) || [];
}

// ============================================================
// ESTOQUE
// ============================================================

export interface ProdutoEstoque {
  id: string;
  name: string;
  stock_current: number;
  sale_price: number | null;
  category: string | null;
}

export async function buscarProdutoEstoque(
  sb: SupabaseClient,
  descricao: string,
  storeId?: string
): Promise<ProdutoEstoque[]> {
  const palavras = descricao.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  if (palavras.length === 0) return [];

  const filtros = palavras.map((p) => `name.ilike.%${p}%`).join(',');

  let query = sb
    .from('inventory_products')
    .select('id, name, stock_current, sale_price, category')
    .or(filtros)
    .gt('stock_current', 0);

  if (storeId) query = query.eq('store_id', storeId);

  const { data } = await query.limit(5);
  return (data as ProdutoEstoque[]) || [];
}

export async function buscarHistoricoBalcao(
  sb: SupabaseClient,
  descricao: string,
  storeId?: string
): Promise<{ descricao: string; preco_min: number; preco_max: number; ultima_venda: string | null }[]> {
  const palavras = descricao.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  if (palavras.length === 0) return [];

  const filtros = palavras.map((p) => `descricao.ilike.%${p}%`).join(',');

  let query = sb
    .from('balcao_items')
    .select('descricao, preco_unit, created_at')
    .or(filtros);

  if (storeId) query = (query as any).eq('store_id', storeId);

  const { data } = await query.order('created_at', { ascending: false }).limit(50);

  if (!data || data.length === 0) return [];

  // Agrupa por descricao similar e calcula min/max
  const agrupado = new Map<string, { precos: number[]; ultima: string | null }>();

  for (const item of data as { descricao: string; preco_unit: number; created_at: string }[]) {
    const key = item.descricao.toLowerCase().trim();
    const existing = agrupado.get(key);
    if (existing) {
      existing.precos.push(item.preco_unit);
    } else {
      agrupado.set(key, { precos: [item.preco_unit], ultima: item.created_at });
    }
  }

  return Array.from(agrupado.entries()).slice(0, 3).map(([desc, val]) => ({
    descricao: desc,
    preco_min: Math.min(...val.precos),
    preco_max: Math.max(...val.precos),
    ultima_venda: val.ultima,
  }));
}

// ============================================================
// AGENDAMENTOS
// ============================================================

export async function buscarHorariosDisponiveis(
  sb: SupabaseClient,
  diasAdiante = 7,
  storeId?: string
): Promise<{ date: string; turnos_livres: string[] }[]> {
  // Buscar capacidade máxima configurada
  let storeQuery = sb.from('store_settings').select('max_agendamentos_dia');
  if (storeId) storeQuery = storeQuery.eq('id', storeId);
  const { data: storeData } = await storeQuery.limit(1).maybeSingle();
  const maxDia: number = (storeData as { max_agendamentos_dia?: number } | null)?.max_agendamentos_dia ?? 10;
  const maxPorTurno = Math.ceil(maxDia / 2);

  const hoje = new Date();
  const resultado: { date: string; turnos_livres: string[] }[] = [];

  for (let i = 1; i <= diasAdiante; i++) {
    const d = new Date(hoje);
    d.setDate(d.getDate() + i);
    // Pular domingos (0)
    if (d.getDay() === 0) continue;

    const dateStr = d.toISOString().split('T')[0];

    let apptQuery = sb
      .from('appointments')
      .select('shift')
      .eq('appointment_date', dateStr)
      .neq('status', 'cancelado');
    if (storeId) apptQuery = apptQuery.eq('store_id', storeId);
    const { data: agendados } = await apptQuery;

    const lista = (agendados as { shift: string }[] | null) || [];
    const countManha = lista.filter((a) => a.shift === 'manha').length;
    const countTarde = lista.filter((a) => a.shift === 'tarde').length;
    const totalDia = lista.length;

    const livres: string[] = [];
    if (totalDia < maxDia) {
      if (countManha < maxPorTurno) livres.push('manha');
      if (countTarde < maxPorTurno) livres.push('tarde');
    }

    if (livres.length > 0) {
      resultado.push({ date: dateStr, turnos_livres: livres });
    }
  }

  return resultado;
}

export async function criarAgendamento(
  sb: SupabaseClient,
  dados: {
    client_name: string;
    client_phone: string;
    client_id?: string | null;
    store_id?: string | null;
    status?: string;
    appointment_date: string;
    shift: string;
    equipment: string;
    service_description: string;
    mechanic_id?: string | null;
  }
): Promise<{ id: string } | null> {
  const { data, error } = await sb
    .from('appointments')
    .insert({
      client_name: dados.client_name,
      client_phone: dados.client_phone,
      client_id: dados.client_id || null,
      store_id: dados.store_id || null,
      appointment_date: dados.appointment_date,
      shift: dados.shift,
      equipment: dados.equipment,
      service_description: dados.service_description,
      mechanic_id: dados.mechanic_id || null,
      status: dados.status || 'confirmado',
    })
    .select('id')
    .single();

  if (error) {
    console.error('Erro ao criar agendamento:', error);
    return null;
  }

  return data as { id: string };
}

// ============================================================
// STORE SETTINGS
// ============================================================

export interface StoreInfo {
  id: string | null;
  company_name: string;
  store_address: string | null;
  store_phone: string | null;
  store_instagram: string | null;
  store_hours: string | null;
  accepted_payments: string | null;
  opening_hours: string | null;
  payment_methods: string | null;
  ai_notes: string | null;
  ai_enabled: boolean | null;
  max_agendamentos_dia: number;
  asaas_api_key: string | null;
  boleto_notify_phone_1: string | null;
  boleto_notify_phone_2: string | null;
  tem_estoque: boolean;
}

export async function buscarStoreSettings(sb: SupabaseClient, storeId?: string): Promise<StoreInfo> {
  let query = sb
    .from('store_settings')
    .select('id, company_name, store_address, store_phone, opening_hours, payment_methods, ai_notes, max_agendamentos_dia, google_maps_url, asaas_api_key, boleto_notify_phone_1, boleto_notify_phone_2');

  if (storeId) {
    query = query.eq('id', storeId);
  }

  const { data, error: storeErr } = await query.limit(1).maybeSingle();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = data as Record<string, any> | null;
  if (storeErr) console.error('❌ buscarStoreSettings error:', storeErr.message);

  // Só ativa a busca real de estoque pro Max se a loja de fato cadastra
  // produtos — senão ele fica prometendo/negando peças com base numa
  // tabela vazia (caso da Bandara Motos, que não usa esse módulo).
  let temEstoque = false;
  const resolvedId = d?.id as string | undefined;
  if (resolvedId) {
    const { count } = await sb
      .from('inventory_products')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', resolvedId);
    temEstoque = !!count && count > 0;
  }

  return {
    id: d?.id || null,
    company_name: d?.company_name || 'Bandara Motos',
    store_address: d?.store_address || null,
    store_phone: d?.store_phone || null,
    store_instagram: d?.store_instagram || null,
    store_hours: d?.store_hours || null,
    accepted_payments: d?.accepted_payments || null,
    opening_hours: d?.opening_hours || null,
    payment_methods: d?.payment_methods || null,
    ai_notes: d?.ai_notes || null,
    ai_enabled: null,
    max_agendamentos_dia: d?.max_agendamentos_dia ?? 10,
    asaas_api_key: d?.asaas_api_key || null,
    boleto_notify_phone_1: d?.boleto_notify_phone_1 || null,
    boleto_notify_phone_2: d?.boleto_notify_phone_2 || null,
    tem_estoque: temEstoque,
  };
}

// ============================================================
// LEMBRETES DE MANUTENÇÃO
// ============================================================

export async function buscarUltimoServicoKeyword(
  sb: SupabaseClient,
  clientId: string,
  keyword: string
): Promise<{ service_date: string; reminder_days: number; reminder_message: string | null } | null> {
  // Normaliza keyword para comparação (sem acento, minúsculo)
  const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const kwNorm = normalize(keyword);

  const { data: rows } = await sb
    .from('maintenance_reminders')
    .select('service_date, keyword:maintenance_keywords(keyword, reminder_days, reminder_message)')
    .eq('client_id', clientId)
    .order('service_date', { ascending: false })
    .limit(20);

  if (!rows || rows.length === 0) return null;

  // Filtra pelo keyword mais específico que contenha o termo buscado
  type ReminderRow = { service_date: string; keyword: { keyword: string; reminder_days: number; reminder_message: string | null } | null };
  const matched = (rows as ReminderRow[]).find(r => normalize(r.keyword?.keyword || '').includes(kwNorm) || kwNorm.includes(normalize(r.keyword?.keyword || '')));
  const data = matched || null;

  if (!data) return null;

  const row = data as { service_date: string; keyword: { keyword: string; reminder_days: number; reminder_message: string | null } | null };
  return {
    service_date: row.service_date,
    reminder_days: row.keyword?.reminder_days || 90,
    reminder_message: row.keyword?.reminder_message || null,
  };
}

// ============================================================
// SATISFAÇÃO
// ============================================================

export async function buscarLinkSatisfacao(
  sb: SupabaseClient,
  orderId: string
): Promise<string | null> {
  const { data } = await sb
    .from('satisfaction_ratings')
    .select('public_token')
    .eq('order_id', orderId)
    .maybeSingle();

  if (!data) return null;

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  // Monta a URL base do site a partir do projeto
  const projectRef = supabaseUrl.replace('https://', '').split('.')[0];
  const row = data as { public_token: string };
  return `https://${projectRef}.vercel.app/avaliar/${orderId}`;
}

// ============================================================
// FIADOS
// ============================================================

export async function buscarFiadoPorTelefone(
  sb: SupabaseClient,
  phone: string,
  cpf?: string,
  storeId?: string
): Promise<{ fiados: { id: string; client_name: string; original_amount: number; amount_paid: number; interest_accrued: number; due_date: string; status: string; asaas_payment_url: string | null }[]; total_aberto: number } | null> {
  type FiadoRow = { id: string; client_name: string; original_amount: number; amount_paid: number; interest_accrued: number; due_date: string; status: string; asaas_payment_url: string | null }

  let rows: FiadoRow[] = []

  const clean = (phone || '').replace(/\D/g, '')

  if (clean) {
    const sem55 = clean.startsWith('55') ? clean.slice(2) : clean
    const sem9 = (sem55.length === 11 && sem55[2] === '9')
      ? sem55.slice(0, 2) + sem55.slice(3)
      : sem55
    const ultimos8 = sem55.slice(-8)

    const filtros = [
      `client_phone.ilike.%${sem55}%`,
      ...(sem9 !== sem55 ? [`client_phone.ilike.%${sem9}%`] : []),
      `client_phone.ilike.%${ultimos8}%`,
    ]

    let fiadoQuery = sb
      .from('fiados')
      .select('id, client_name, original_amount, amount_paid, interest_accrued, due_date, status, asaas_payment_url')
      .neq('status', 'pago')
      .or(filtros.join(','));

    if (storeId) fiadoQuery = fiadoQuery.eq('store_id', storeId);

    const { data } = await fiadoQuery.order('due_date', { ascending: true })

    if (data && data.length > 0) rows = data as FiadoRow[]
  }

  // Fallback: busca por CPF se não encontrou por telefone
  if (rows.length === 0 && cpf) {
    const cpfClean = cpf.replace(/\D/g, '')
    if (cpfClean.length >= 11) {
      let cpfQuery = sb
        .from('fiados')
        .select('id, client_name, original_amount, amount_paid, interest_accrued, due_date, status, asaas_payment_url')
        .neq('status', 'pago')
        .eq('client_cpf', cpfClean);

      if (storeId) cpfQuery = cpfQuery.eq('store_id', storeId);

      const { data } = await cpfQuery.order('due_date', { ascending: true })

      if (data && data.length > 0) rows = data as FiadoRow[]
    }
  }

  if (rows.length === 0) return null

  // Remove fiados com saldo zerado (criados incorretamente com original_amount = 0)
  const comSaldo = rows.filter(f =>
    ((f.original_amount || 0) + (f.interest_accrued || 0) - (f.amount_paid || 0)) > 0
  )

  if (comSaldo.length === 0) return null

  const total_aberto = comSaldo.reduce((sum, f) =>
    sum + Math.max((f.original_amount || 0) + (f.interest_accrued || 0) - (f.amount_paid || 0), 0), 0)

  return { fiados: comSaldo, total_aberto }
}
