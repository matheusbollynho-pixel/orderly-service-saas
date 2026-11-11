import { sendWhatsAppText, normalizeBrPhone, type StoreWhatsAppConfig } from '../_shared/whatsapp.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Loja "dona" da instância global compartilhada (legado, pré multi-tenant).
// Só ela pode enviar sem instância própria configurada.
const LEGACY_DEFAULT_STORE_ID = '9fd27114-97d1-48cd-ad09-1b057fa9c185'

const SHIFT_LABELS: Record<string, string> = {
  manha: 'Manhã',
  tarde: 'Tarde',
  dia_todo: 'Dia todo',
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })
}

const DEFAULT_TEMPLATE = `Olá{{nome}}! 👋

Seu agendamento na *{{empresa}}* foi confirmado! ✅

📅 *Data:* {{data}}
🕐 *Horário:* {{turno}}
🏍️ *Moto:* {{moto}}
🔧 *Serviço:* {{servico}}

Qualquer dúvida, é só chamar. Te esperamos! 😊

*{{empresa}}* 🏍️🔧`

async function loadSettings(storeId?: string): Promise<{
  company_name: string
  template: string
  hasOwnInstance: boolean
  wppConfig: StoreWhatsAppConfig
}> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  if (!supabaseUrl || !supabaseKey) {
    return { company_name: 'Minha Oficina', template: DEFAULT_TEMPLATE, hasOwnInstance: false, wppConfig: {} }
  }

  const client = createClient(supabaseUrl, supabaseKey)
  let query = client
    .from('store_settings')
    .select('id, company_name, whatsapp_confirmation_template, whatsapp_provider, whatsapp_instance_url, whatsapp_instance_token')
  if (storeId) query = query.eq('id', storeId)
  const { data } = await query.limit(1).maybeSingle()

  return {
    company_name: data?.company_name || 'Minha Oficina',
    template: data?.whatsapp_confirmation_template || DEFAULT_TEMPLATE,
    hasOwnInstance: !!data?.whatsapp_instance_url || data?.id === LEGACY_DEFAULT_STORE_ID,
    wppConfig: {
      provider: data?.whatsapp_provider || undefined,
      instance_url: data?.whatsapp_instance_url || undefined,
      instance_token: data?.whatsapp_instance_token || undefined,
    },
  }
}

function buildMessage(params: {
  client_name: string
  appointment_date: string
  shift: string
  appointment_time: string | null
  equipment: string
  service_description: string
  company_name: string
  template: string
}): string {
  const nome = params.client_name ? `, ${params.client_name.split(' ')[0]}` : ''
  const data = formatDate(params.appointment_date)
  const turnoLabel = SHIFT_LABELS[params.shift] ?? params.shift
  const hora = params.appointment_time ? params.appointment_time.slice(0, 5) : ''
  // {{turno}} já existe nos templates salvos das lojas: com horário vira "09:30 (Manhã)"
  const turno = hora ? `${hora} (${turnoLabel})` : turnoLabel
  const horario = hora || turnoLabel

  return params.template
    .replace(/\{\{nome\}\}/g, nome)
    .replace(/\{\{empresa\}\}/g, params.company_name)
    .replace(/\{\{data\}\}/g, data)
    .replace(/\{\{turno\}\}/g, turno)
    .replace(/\{\{horario\}\}/g, horario)
    .replace(/\{\{moto\}\}/g, params.equipment || '')
    .replace(/\{\{servico\}\}/g, params.service_description || '')
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })

  const json = (obj: unknown, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const admin = createClient(supabaseUrl, serviceKey)

    // Quem pode chamar: a IA (service key) ou alguém logado que é membro da loja do agendamento.
    // Antes era aberta: qualquer um mandava mensagem pelo WhatsApp de qualquer loja.
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    if (!token) return json({ success: false, error: 'Sem autenticação' }, 401)
    const isService = !!serviceKey && token === serviceKey

    const body = await req.json().catch(() => ({}))
    const appointmentId = typeof body?.appointment_id === 'string' ? body.appointment_id : ''
    if (!appointmentId) return json({ success: false, error: 'appointment_id obrigatório' }, 400)

    // Dados vêm do banco, nunca do corpo da requisição
    const { data: appt } = await admin
      .from('appointments')
      .select('id, store_id, client_name, client_phone, appointment_date, shift, appointment_time, equipment, service_description, status')
      .eq('id', appointmentId)
      .maybeSingle()
    if (!appt) return json({ success: false, error: 'Agendamento não encontrado' }, 404)

    if (!isService) {
      const { data: userData } = await admin.auth.getUser(token)
      if (!userData?.user) return json({ success: false, error: 'Sessão inválida' }, 401)
      const { data: member } = await admin
        .from('store_members')
        .select('store_id')
        .eq('user_id', userData.user.id)
        .eq('store_id', appt.store_id)
        .eq('active', true)
        .maybeSingle()
      if (!member) return json({ success: false, error: 'Sem acesso a esta loja' }, 403)
    }

    if (appt.status === 'cancelado') return json({ success: false, error: 'Agendamento cancelado' })

    const { client_name, client_phone, appointment_date, shift, appointment_time, equipment, service_description, store_id } = appt

    if (!client_phone) {
      return json({ success: false, error: 'Telefone do cliente não informado' }, 400)
    }

    const phone = normalizeBrPhone(client_phone)
    const { company_name, template, hasOwnInstance, wppConfig } = await loadSettings(store_id)

    if (!hasOwnInstance) {
      console.log(`⏭️ Loja ${store_id || '(sem id)'} sem WhatsApp configurado — confirmação não enviada`)
      return new Response(
        JSON.stringify({ success: false, error: 'WhatsApp não configurado para esta loja' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const message = buildMessage({ client_name, appointment_date, shift, appointment_time, equipment, service_description, company_name, template })

    await sendWhatsAppText(phone, message, wppConfig, { storeId: store_id, feature: 'agendamento_confirmacao' })

    console.log(`✅ Confirmação enviada para ${phone}`)

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('❌ Erro:', err.message)
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
