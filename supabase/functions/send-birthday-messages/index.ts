import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendWhatsAppText, normalizeBrPhone, type StoreWhatsAppConfig } from '../_shared/whatsapp.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || ''

async function personalizarMensagem(
  template: string,
  companyName: string,
  clientName: string,
  apelido: string,
  motos: string[],
  ultimoServico: string | null
): Promise<string> {
  if (!ANTHROPIC_API_KEY) {
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
- Use formatação WhatsApp (*negrito*) — NUNCA **duplo asterisco**
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
    console.error('Erro Claude:', e)
    return template
      .replace(/\{\{nome\}\}/g, apelido ? `, ${apelido}` : '')
      .replace(/\{\{empresa\}\}/g, companyName)
  }
}

async function processarLoja(store: { id: string; company_name: string; whatsapp_birthday_template: string | null; whatsapp_provider: string | null; whatsapp_instance_url: string | null; whatsapp_instance_token: string | null }) {
  const wppConfig: StoreWhatsAppConfig = {
    provider: store.whatsapp_provider || undefined,
    instance_url: store.whatsapp_instance_url || undefined,
    instance_token: store.whatsapp_instance_token || undefined,
  }
  const today = new Date()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')

  const company_name = store.company_name || 'Minha Oficina'
  const template = store.whatsapp_birthday_template ||
    '🎉 *Feliz aniversário{{nome}}!* 🎂🥳\n\nA equipe da *{{empresa}}* deseja muitas conquistas e bons quilômetros pela frente! 🏍️💨\n\nPra comemorar, você ganhou:\n🎁 *15% de desconto* em serviços da oficina ou peças à vista.\n\n⏰ Válido por 7 dias.\n\n*{{empresa}}* — cuidando da sua moto como você merece!'

  // Buscar OS desta loja com aniversariantes do dia
  const { data: orders, error } = await supabase
    .from('service_orders')
    .select('id, client_name, client_phone, client_birth_date')
    .eq('store_id', store.id)
    .not('client_birth_date', 'is', null)
    .not('client_phone', 'is', null)

  if (error || !orders?.length) return { store_id: store.id, enviados: 0 }

  const aniversariantes = orders.filter(o => {
    const [, bMonth, bDay] = o.client_birth_date.split('-')
    return bMonth === month && bDay === day
  })

  if (!aniversariantes.length) return { store_id: store.id, enviados: 0 }

  const vistos = new Set<string>()
  let enviados = 0

  for (const person of aniversariantes) {
    if (!person.client_phone || vistos.has(person.client_phone)) continue
    vistos.add(person.client_phone)

    try {
      // Buscar apelido e motos do cliente nesta loja
      const { data: cliente } = await supabase
        .from('clients')
        .select('apelido, id')
        .eq('store_id', store.id)
        .eq('phone', person.client_phone)
        .maybeSingle()

      let motos: string[] = []
      if (cliente?.id) {
        const { data: motorcycles } = await supabase
          .from('motorcycles')
          .select('brand, model, year')
          .eq('client_id', cliente.id)
          .limit(3)
        motos = (motorcycles || []).map(m => `${m.brand} ${m.model}${m.year ? ` ${m.year}` : ''}`)
      }

      const apelido = cliente?.apelido || person.client_name.split(' ')[0]
      const message = await personalizarMensagem(template, company_name, person.client_name, apelido, motos, null)

      await sendWhatsAppText(normalizeBrPhone(person.client_phone), message, wppConfig)

      const now = new Date()
      await supabase.from('birthday_discounts').insert({
        store_id: store.id,
        service_order_id: person.id,
        discount_percentage: 15.00,
        starts_at: now.toISOString(),
        expires_at: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        is_active: true,
        message_sent_at: now.toISOString(),
      })

      enviados++
      console.log(`✅ [${company_name}] Aniversário enviado para ${person.client_name}`)
    } catch (e) {
      console.error(`❌ [${company_name}] Erro para ${person.client_name}:`, e)
    }
  }

  return { store_id: store.id, company: company_name, enviados }
}

Deno.serve(async (_req) => {
  try {
    console.log('🎂 Verificando aniversariantes por loja...')

    const { data: stores, error } = await supabase
      .from('store_settings')
      .select('id, company_name, whatsapp_birthday_template, whatsapp_provider, whatsapp_instance_url, whatsapp_instance_token')
      .eq('active', true)

    if (error) throw error

    const results = []
    for (const store of stores || []) {
      const result = await processarLoja(store)
      results.push(result)
    }

    const totalEnviados = results.reduce((s, r) => s + r.enviados, 0)
    console.log(`📊 Total: ${totalEnviados} mensagens enviadas em ${results.length} loja(s)`)

    return new Response(JSON.stringify({ success: true, lojas: results.length, enviados: totalEnviados }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('❌ Erro geral:', error)
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
