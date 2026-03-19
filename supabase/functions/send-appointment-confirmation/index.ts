import { sendWhatsAppText, normalizeBrPhone } from '../_shared/whatsapp.ts'

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

function buildMessage(params: {
  client_name: string
  appointment_date: string
  shift: string
  equipment: string
  service_description: string
}): string {
  const nome = params.client_name ? `, ${params.client_name.split(' ')[0]}` : ''
  const data = formatDate(params.appointment_date)
  const turno = SHIFT_LABELS[params.shift] ?? params.shift

  return (
    `Olá${nome}! 👋\n\n` +
    `Seu agendamento na *Bandara Motos* foi confirmado! ✅\n\n` +
    `📅 *Data:* ${data}\n` +
    `🕐 *Turno:* ${turno}\n` +
    `🏍️ *Moto:* ${params.equipment}\n` +
    `🔧 *Serviço:* ${params.service_description}\n\n` +
    `Qualquer dúvida, é só chamar. Te esperamos! 😊\n\n` +
    `*Bandara Motos* 🏍️🔧`
  )
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
    const message = buildMessage({ client_name, appointment_date, shift, equipment, service_description })

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
