// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS_HEADERS })
}

function normalizeTags(input: any) {
  return {
    atendimento: Array.isArray(input?.atendimento) ? input.atendimento : [],
    servico: Array.isArray(input?.servico) ? input.servico : [],
  }
}

Deno.serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }

    const url = new URL(req.url)

    if (req.method === 'GET') {
      const token = url.searchParams.get('token')
      if (!token) return json({ success: false, message: 'Token ausente' }, 400)

      const { data: rating, error: ratingError } = await supabase
        .from('satisfaction_ratings')
        .select('id, order_id, client_id, atendimento_id, mechanic_id, responded_at, atendimento_rating, servico_rating, comment, tags, recommends')
        .eq('public_token', token)
        .limit(1)

      if (ratingError || !rating || rating.length === 0) {
        return json({ success: false, message: 'Link inválido ou expirado' }, 404)
      }

      const row = rating[0]

      const { data: order } = await supabase
        .from('service_orders')
        .select('id, client_name, equipment, problem_description, entry_date, client_phone, mechanic_id, atendimento_id')
        .eq('id', row.order_id)
        .single()



      // Se mechanic_id ou atendimento_id estão vazios no rating, usar da ordem
      let mechanicId = row.mechanic_id
      let atendimentoId = row.atendimento_id

      if (!mechanicId || !atendimentoId) {
        if (order) {
          mechanicId = order.mechanic_id || mechanicId
          atendimentoId = order.atendimento_id || atendimentoId
        }

        // Se conseguiu dados novos, atualizar no banco
        if (mechanicId || atendimentoId) {
          await supabase
            .from('satisfaction_ratings')
            .update({
              mechanic_id: mechanicId,
              atendimento_id: atendimentoId
            })
            .eq('id', row.id)
        }
      }

      // Buscar dados de mecânico e atendimento
      const { data: mechanic } = mechanicId
        ? await supabase.from('mechanics').select('id, name').eq('id', mechanicId).single()
        : { data: null }

      const { data: atendimento } = atendimentoId
        ? await supabase.from('staff_members').select('id, name, photo_url').eq('id', atendimentoId).single()
        : { data: null }
      return json({
        success: true,
        alreadyResponded: !!row.responded_at,
        rating: {






          atendimento_rating: row.atendimento_rating,
          servico_rating: row.servico_rating,
          comment: row.comment,
          recommends: row.recommends,
          tags: normalizeTags(row.tags),
          responded_at: row.responded_at,
        },
        order: {
          id: order?.id,
          client_name: order?.client_name,
          equipment: order?.equipment,
          problem_description: order?.problem_description,
          entry_date: order?.entry_date,
          client_phone: order?.client_phone,
        },
        mechanic: mechanic || null,
        atendimento: atendimento || null,
      })
    }

    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}))
      const token = body?.token

      if (!token) return json({ success: false, message: 'Token ausente' }, 400)

      const atendimentoRating = Number(body?.atendimento_rating)
      const servicoRating = Number(body?.servico_rating)

      if (!(atendimentoRating >= 1 && atendimentoRating <= 5) || !(servicoRating >= 1 && servicoRating <= 5)) {
        return json({ success: false, message: 'Notas inválidas' }, 400)
      }

      const { data: existing, error: existingError } = await supabase
        .from('satisfaction_ratings')
        .select('id, responded_at, order_id, mechanic_id, atendimento_id')
        .eq('public_token', token)
        .limit(1)

      if (existingError || !existing || existing.length === 0) {
        return json({ success: false, message: 'Link inválido ou expirado' }, 404)
      }

      if (existing[0].responded_at) {
        return json({ success: false, message: 'Esta avaliação já foi respondida.' }, 409)
      }

      // Se mechanic_id ou atendimento_id estão vazios, buscar na ordem de serviço
      let mechanicId = existing[0].mechanic_id
      let atendimentoId = existing[0].atendimento_id

      if (!mechanicId || !atendimentoId) {
        const { data: order } = await supabase
          .from('service_orders')
          .select('mechanic_id, atendimento_id')
          .eq('id', existing[0].order_id)
          .single()

        if (order) {
          mechanicId = order.mechanic_id || mechanicId
          atendimentoId = order.atendimento_id || atendimentoId
        }
      }

      const tags = normalizeTags(body?.tags)

      const { error: updateError } = await supabase
        .from('satisfaction_ratings')
        .update({
          atendimento_rating: atendimentoRating,
          servico_rating: servicoRating,
          mechanic_id: mechanicId,
          atendimento_id: atendimentoId,
          tags,
          comment: body?.comment || null,
          recommends: typeof body?.recommends === 'boolean' ? body.recommends : null,
          status: 'pendente',
          responded_at: new Date().toISOString(),
        })
        .eq('id', existing[0].id)

      if (updateError) {
        console.error('Erro ao salvar avaliação:', updateError)
        return json({ success: false, message: 'Erro ao salvar avaliação' }, 500)
      }

      return json({ success: true, message: 'Avaliação registrada com sucesso' })
    }

    return json({ success: false, message: 'Método não permitido' }, 405)
  } catch (error) {
    console.error('Erro geral satisfaction-public:', error)
    return json({ success: false, message: error?.message || 'Erro interno' }, 500)
  }
})
