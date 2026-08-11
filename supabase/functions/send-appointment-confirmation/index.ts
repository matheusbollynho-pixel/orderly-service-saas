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
🕐 *Turno:* {{turno}}
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
  equipment: string
  service_description: string
  company_name: string
  template: string
}): string {
  const nome = params.client_name ? `, ${params.client_name.split(' ')[0]}` : ''
  const data = formatDate(params.appointment_date)
  const turno = SHIFT_LABELS[params.shift] ?? params.shift

  return params.template
    .replace(/\{\{nome\}\}/g, nome)
    .replace(/\{\{empresa\}\}/g, params.company_name)
    .replace(/\{\{data\}\}/g, data)
    .replace(/\{\{turno\}\}/g, turno)
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

  try {
    const body = await req.json()
    const { client_name, client_phone, appointment_date, shift, equipment, service_description, store_id } = body

    if (!client_phone) {
      return new Response(
        JSON.stringify({ success: false, error: 'Telefone do cliente não informado' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
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

    const message = buildMessage({ client_name, appointment_date, shift, equipment, service_description, company_name, template })

    await sendWhatsAppText(phone, message, wppConfig)

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
