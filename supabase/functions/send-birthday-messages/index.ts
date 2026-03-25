import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendWhatsAppText, normalizeBrPhone } from '../_shared/whatsapp.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || ''

// ── Configurações da loja ─────────────────────────────────────
async function loadSettings() {
  const { data } = await supabase
    .from('store_settings')
    .select('company_name, whatsapp_birthday_template')
    .limit(1)
    .maybeSingle()
  return {
    company_name: data?.company_name || 'Minha Oficina',
    template: data?.whatsapp_birthday_template ||
      '🎉 *Feliz aniversário!* 🎂🥳\n\nA equipe da *{{empresa}}* deseja muitas conquistas e bons quilômetros pela frente! 🏍️💨\n\nPra comemorar, você ganhou:\n🎁 *15% de desconto* em serviços da oficina ou peças à vista.\n\n⏰ Válido por 7 dias.\nÉ só apresentar esta mensagem 😉\n\n*{{empresa}}* — cuidando da sua moto como você merece!',
  }
}

// ── Buscar dados do cliente para personalização ───────────────
async function buscarDadosCliente(phone: string, clientName: string) {
  // Apelido do cliente
  const { data: cliente } = await supabase
    .from('clients')
    .select('apelido, id')
    .eq('phone', phone)
    .maybeSingle()

  // Motos cadastradas
  let motos: string[] = []
  if (cliente?.id) {
    const { data: motorcycles } = await supabase
      .from('motorcycles')
      .select('brand, model, year')
      .eq('client_id', cliente.id)
      .order('created_at', { ascending: false })
      .limit(3)
    motos = (motorcycles || []).map(m => `${m.brand} ${m.model}${m.year ? ` ${m.year}` : ''}`)
  }

  // Último serviço realizado
  const { data: ultimaOS } = await supabase
    .from('service_orders')
    .select('service_description, data_conclusao, status_oficina')
    .eq('client_phone', phone)
    .in('status', ['concluido', 'concluido_e_entregue'])
    .order('data_conclusao', { ascending: false })
    .limit(1)
    .maybeSingle()

  return {
    apelido: cliente?.apelido || clientName.split(' ')[0],
    motos,
    ultimoServico: (ultimaOS as { service_description?: string } | null)?.service_description || null,
  }
}

// ── Personalizar mensagem com Claude ─────────────────────────
async function personalizarMensagem(
  template: string,
  companyName: string,
  clientName: string,
  apelido: string,
  motos: string[],
  ultimoServico: string | null
): Promise<string> {
  if (!ANTHROPIC_API_KEY) {
    // Sem API key → fallback para template simples
    return template
      .replace(/\{\{nome\}\}/g, apelido ? `, ${apelido}` : '')
      .replace(/\{\{empresa\}\}/g, companyName)
  }

  const motoInfo = motos.length > 0 ? motos.join(', ') : null
  const contexto = [
    motoInfo ? `Moto(s) do cliente: ${motoInfo}` : null,
    ultimoServico ? `Último serviço realizado: ${ultimoServico}` : null,
  ].filter(Boolean).join('\n')

  const prompt = `Você é um assistente de uma oficina de motos chamada ${companyName}.
Personalize a mensagem de aniversário abaixo para o cliente ${apelido || clientName}.

TEMPLATE BASE (mantenha a estrutura e o desconto de 15%):
${template.replace(/\{\{nome\}\}/g, `, ${apelido || clientName.split(' ')[0]}`).replace(/\{\{empresa\}\}/g, companyName)}

INFORMAÇÕES DO CLIENTE:
${contexto || 'Sem histórico disponível'}

REGRAS:
- Mantenha o desconto de 15% e validade de 7 dias
- Use formatação WhatsApp (*negrito*, _itálico_) — NUNCA **duplo asterisco**
- Seja caloroso e pessoal, mencione a moto ou último serviço se disponível
- Máximo 10 linhas
- Retorne APENAS a mensagem final, sem explicações`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!res.ok) throw new Error(`Claude API error: ${res.status}`)
    const data = await res.json()
    return data.content?.[0]?.text || template
      .replace(/\{\{nome\}\}/g, `, ${apelido}`)
      .replace(/\{\{empresa\}\}/g, companyName)
  } catch (e) {
    console.error('Erro ao chamar Claude para personalizar aniversário:', e)
    // Fallback para template simples
    return template
      .replace(/\{\{nome\}\}/g, apelido ? `, ${apelido}` : '')
      .replace(/\{\{empresa\}\}/g, companyName)
  }
}

// ── Aniversariantes do dia ────────────────────────────────────
async function getTodaysBirthdays() {
  const today = new Date()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')

  const { data: orders, error } = await supabase
    .from('service_orders')
    .select('id, client_name, client_phone, client_birth_date')
    .not('client_birth_date', 'is', null)

  if (error) throw error

  return (orders || []).filter(order => {
    const [, birthMonth, birthDay] = order.client_birth_date.split('-')
    return birthMonth === month && birthDay === day
  })
}

// ── Handler principal ─────────────────────────────────────────
Deno.serve(async (_req) => {
  try {
    console.log('🎂 Verificando aniversariantes do dia...')

    const birthdays = await getTodaysBirthdays()
    console.log(`📊 Encontrados ${birthdays.length} aniversariante(s)`)

    if (birthdays.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'Nenhum aniversariante hoje', count: 0 }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const { company_name, template } = await loadSettings()
    const results = []

    // Deduplicar por telefone (pode haver múltiplas OS do mesmo cliente)
    const vistos = new Set<string>()

    for (const person of birthdays) {
      if (!person.client_phone || vistos.has(person.client_phone)) continue
      vistos.add(person.client_phone)

      try {
        console.log(`🎁 Personalizando mensagem para ${person.client_name}...`)

        const { apelido, motos, ultimoServico } = await buscarDadosCliente(
          person.client_phone,
          person.client_name
        )

        const message = await personalizarMensagem(
          template,
          company_name,
          person.client_name,
          apelido,
          motos,
          ultimoServico
        )

        console.log(`📱 Enviando para ${person.client_name} (${person.client_phone})`)
        await sendWhatsAppText(normalizeBrPhone(person.client_phone), message)

        // Registrar desconto de aniversário
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

        results.push({ name: person.client_name, phone: person.client_phone, success: true })
        console.log(`✅ Mensagem personalizada enviada para ${person.client_name}`)

      } catch (error) {
        console.error(`❌ Erro ao enviar para ${person.client_name}:`, error)
        results.push({ name: person.client_name, phone: person.client_phone, success: false, error: error.message })
      }
    }

    const successCount = results.filter(r => r.success).length
    return new Response(JSON.stringify({
      success: true,
      message: `${successCount}/${results.length} mensagens enviadas`,
      results,
    }), { headers: { 'Content-Type': 'application/json' } })

  } catch (error) {
    console.error('❌ Erro geral:', error)
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
