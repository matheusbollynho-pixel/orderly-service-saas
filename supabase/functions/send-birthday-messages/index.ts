// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendWhatsAppText, normalizeBrPhone } from '../_shared/whatsapp.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const BIRTHDAY_MESSAGE = `🎉 *Feliz aniversário!* 🎂🥳

A equipe da *Bandara Motos* deseja muitas conquistas e bons quilômetros pela frente! 🏍️💨

Pra comemorar, você ganhou:
🎁 *15% de desconto* em serviços da oficina ou peças à vista.

⏰ Válido por 7 dias.
É só apresentar esta mensagem 😉

Siga-nos no Instagram: @BandaraMotos

Bandara Motos — cuidando da sua moto como você merece!`

async function sendWhatsApp(phone: string, message: string) {
  const formattedPhone = normalizeBrPhone(phone)
  return await sendWhatsAppText(formattedPhone, message)
}

async function getTodaysBirthdays() {
  const today = new Date()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')

  const { data: orders, error } = await supabase
    .from('service_orders')
    .select('id, client_name, client_phone, client_birth_date')
    .not('client_birth_date', 'is', null)

  if (error) throw error

  // Filter by birthday (ignoring year)
  return (orders || []).filter(order => {
    const [, birthMonth, birthDay] = order.client_birth_date.split('-')
    return birthMonth === month && birthDay === day
  })
}

Deno.serve(async (req) => {
  try {
    console.log('🎂 Verificando aniversariantes do dia...')
    
    const birthdays = await getTodaysBirthdays()
    console.log(`📊 Encontrados ${birthdays.length} aniversariante(s)`)

    if (birthdays.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'Nenhum aniversariante hoje',
        count: 0
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    const results = []
    
    for (const person of birthdays) {
      try {
        console.log(`📱 Enviando para ${person.client_name} (${person.client_phone})`)
        
        await sendWhatsApp(person.client_phone, BIRTHDAY_MESSAGE)
        
        // Create discount record
        const now = new Date()
        const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
        
        await supabase.from('birthday_discounts').insert({
          service_order_id: person.id,
          discount_percentage: 15.00,
          starts_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
          is_active: true,
          message_sent_at: now.toISOString(),
        })
        
        results.push({
          name: person.client_name,
          phone: person.client_phone,
          success: true
        })
        
        console.log(`✅ Mensagem enviada para ${person.client_name}`)
      } catch (error) {
        console.error(`❌ Erro ao enviar para ${person.client_name}:`, error)
        results.push({
          name: person.client_name,
          phone: person.client_phone,
          success: false,
          error: error.message
        })
      }
    }

    const successCount = results.filter(r => r.success).length
    
    return new Response(JSON.stringify({
      success: true,
      message: `${successCount}/${birthdays.length} mensagens enviadas`,
      results: results
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('❌ Erro geral:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
