import { sendWhatsAppText, normalizeBrPhone } from '../_shared/whatsapp.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

async function loadSettings(): Promise<{ company_name: string; template: string }> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  if (!supabaseUrl || !supabaseKey) return { company_name: 'Minha Oficina', template: DEFAULT_TEMPLATE }

  const client = createClient(supabaseUrl, supabaseKey)
  const { data } = await client.from('store_settings').select('company_name, whatsapp_confirmation_template').limit(1).maybeSingle()
  return {
    company_name: data?.company_name || 'Minha Oficina',
    template: data?.whatsapp_confirmation_template || DEFAULT_TEMPLATE,
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
    const { client_name, client_phone, appointment_date, shift, equipment, service_description } = body

    if (!client_phone) {
      return new Response(
        JSON.stringify({ success: false, error: 'Telefone do cliente não informado' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const phone = normalizeBrPhone(client_phone)
    const { company_name, template } = await loadSettings()
    const message = buildMessage({ client_name, appointment_date, shift, equipment, service_description, company_name, template })

    await sendWhatsAppText(phone, message)

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
