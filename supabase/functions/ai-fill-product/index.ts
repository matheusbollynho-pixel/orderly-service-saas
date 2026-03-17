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

  const prompt = `Você é um assistente especializado em peças de moto para oficinas brasileiras. Com base na descrição abaixo, preencha os campos do produto em JSON.

Descrição: "${description}"

Retorne APENAS um JSON válido (sem markdown, sem explicação) com os campos que conseguir inferir:
{
  "name": "nome padronizado e completo da peça (ex: 'Pastilha de Freio Dianteira - Honda CG 160')",
  "category": "categoria principal: freio | motor | suspensão | elétrica | transmissão | carroceria | lubrificação | filtro | arrefecimento | escapamento | pneu | outro",
  "subcategory": "subcategoria específica (ex: pastilha, disco, vela, filtro de ar, corrente, relé, etc)",
  "classification": "classificação geral (ex: peça de desgaste, peça estrutural, fluido, etc)",
  "brand": "marca da peça/fabricante se mencionado",
  "supplier": "fornecedor/distribuidor (ex: NGK do Brasil, Bosch Brasil, Brembo — se marca OEM conhecida, senão null)",
  "part_type": "original | paralela | usada | remanufaturada | outro | null",
  "moto_brand": "marca da moto (Honda, Yamaha, Suzuki, Kawasaki, Dafra, Shineray, etc)",
  "moto_model": "modelo da moto (ex: CG 160, Factor 150, Fazer 250, Titan 150, Bros 160)",
  "moto_year": "ano ou faixa de anos (ex: 2016-2024)",
  "moto_displacement": "cilindrada em cc (ex: 160cc) — infira pelo modelo se souber",
  "moto_version": "versão se houver (ex: ESDI, Start, Fan, Sport)",
  "compatibility": "outras motos compativeis que você conhece (ex: compativel com CG 125, CG 150 e CG 160 de 2009 em diante)",
  "dimensions": "dimensões se souber para o modelo informado (ex: pastilha dianteira CG = 34x43mm)",
  "color": "cor se mencionada",
  "material": "material técnico: pastilha = cerâmico ou semi-metálico; vela padrão = níquel; vela iridium = iridium; filtro = papel filtrante; corrente = aço; cabo = aço revestido; pneu = borracha; etc",
  "side": "direito | esquerdo | dianteiro | traseiro | ambos | nao_aplicavel | null",
  "unit": "un | par | jogo | kit | m | l — par para pastilhas e lonas; l para óleos e fluidos; m para cabos por metro; jogo/kit para conjuntos",
  "notes": "observação técnica útil: intervalo de troca recomendado, cuidados de instalação, compatibilidade especial"
}

Regras:
- Use null apenas para campos que realmente não conseguir inferir — tente preencher o máximo possível
- NÃO invente manufacturer_part_number nem preços
- name: gere sempre um nome limpo e padronizado mesmo que a descrição seja informal
- part_type: marcas NGK, Denso, Bosch, Brembo, EBC, Mahle, Mann, Fram, Motul, Castrol, Shell, Champion, Iridium, Valeo, SKF, FAG, Yamaha, Honda, Suzuki, Kawasaki (peças genuínas) são OEM → "original". Palavras "paralela", "genérica", "universal", "similar", "compatível" → "paralela". "Usada", "seminova" → "usada". Sem informação → null
- supplier: se a marca é OEM conhecida, preencha com o nome do distribuidor oficial no Brasil
- moto_displacement: CG 125 = 125cc, CG 150/Titan 150/Factor 150 = 150cc, CG 160/Titan 160/Bros 160 = 162cc, Fazer 250/Hornet 250 = 249cc, CB 300 = 300cc, XRE 300 = 300cc, Lander 250 = 249cc
- compatibility: use seu conhecimento técnico de intercambialidade de peças entre modelos
- material: use terminologia técnica do setor automotivo
- Pneus: category = "pneu"; subcategory = "pneu dianteiro" ou "pneu traseiro"; dimensions = medida do pneu no formato padrão (ex: 80/100-14, 90/90-18, 2.75-18, 3.00-18); notes deve informar se é com câmara (convencional) ou tubeless, e o perfil (rodoviário, trilha, misto); unit = "un"; material = borracha. Marcas de pneu comuns no Brasil: Pirelli, Michelin, Metzeler, Titan, Maggion, Levorin, Rinaldi, Bridgestone, Continental
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

    let fields: Record<string, unknown>
    try {
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
