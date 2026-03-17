const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
  'Content-Type': 'application/json',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS_HEADERS })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
  if (!ANTHROPIC_API_KEY) return json({ error: 'ANTHROPIC_API_KEY não configurada' }, 500)

  let description: string
  try {
    const body = await req.json()
    description = body.description?.trim()
    if (!description) return json({ error: 'description é obrigatório' }, 400)
  } catch {
    return json({ error: 'JSON inválido' }, 400)
  }

  const prompt = `Você é um assistente especializado em peças de moto. Com base na descrição abaixo, preencha os campos do produto em JSON.

Descrição: "${description}"

Retorne APENAS um JSON válido (sem markdown, sem explicação) com os campos que conseguir inferir:
{
  "name": "nome completo da peça",
  "category": "categoria (ex: freio, motor, suspensão, elétrica, transmissão, carroceria, lubrificação, filtro, outro)",
  "subcategory": "subcategoria específica",
  "classification": "classificação geral",
  "brand": "marca da peça/fabricante se mencionado",
  "supplier": null,
  "part_type": "original | paralela | usada | remanufaturada | outro | null (se não souber)",
  "moto_brand": "marca da moto (Honda, Yamaha, Suzuki, Kawasaki, etc)",
  "moto_model": "modelo da moto",
  "moto_year": "ano ou faixa de anos (ex: 2018-2024)",
  "moto_displacement": "cilindrada (ex: 160cc)",
  "moto_version": "versão se houver",
  "compatibility": "outras motos compatíveis se souber",
  "side": "direito | esquerdo | dianteiro | traseiro | ambos | nao_aplicavel | null",
  "unit": "un | par | jogo | kit | m | l",
  "dimensions": null,
  "color": "cor se mencionada",
  "material": "material se souber (aço, borracha, alumínio, etc)",
  "notes": "observação útil sobre a peça se houver"
}

Regras:
- Use null para campos que não conseguir inferir com segurança
- NÃO invente part_number ou manufacturer_part_number
- NÃO invente preços
- unit deve ser "par" para pastilhas/lonas de freio, "un" para a maioria das peças
- side deve ser inferido quando a descrição mencionar dianteiro/traseiro/direito/esquerdo/frente/trás
- Retorne SOMENTE o JSON, nada mais`

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('Anthropic error:', err)
      return json({ error: 'Erro ao chamar Claude API' }, 502)
    }

    const result = await response.json()
    const text = result.content?.[0]?.text ?? ''

    // Parse JSON da resposta
    let fields: Record<string, unknown>
    try {
      // Remove possível markdown ```json ... ```
      const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      fields = JSON.parse(clean)
    } catch {
      console.error('Falha ao parsear JSON da IA:', text)
      return json({ error: 'IA retornou formato inválido', raw: text }, 502)
    }

    return json({ fields })
  } catch (err) {
    console.error('Erro interno:', err)
    return json({ error: 'Erro interno' }, 500)
  }
})
