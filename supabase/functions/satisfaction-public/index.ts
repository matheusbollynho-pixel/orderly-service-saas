// import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
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

const QR_PLACEHOLDER_EQUIPMENT = '__QR_WALKIN_PLACEHOLDER__'

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS_HEADERS })
}

function normalizeTags(input: Record<string, unknown>) {
  return {
    atendimento: Array.isArray(input?.atendimento) ? input.atendimento : [],
    servico: Array.isArray(input?.servico) ? input.servico : [],
  }
}

async function getStoreId(requestedStoreId?: string | null): Promise<string | null> {
  if (requestedStoreId) return requestedStoreId
  const { data } = await supabase
    .from('store_settings')
    .select('id')
    .limit(1)
    .maybeSingle()
  return data?.id ?? null
}

Deno.serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }

    const url = new URL(req.url)

    if (req.method === 'GET') {
      const mode = url.searchParams.get('mode')

      // Modo: Verificar se cliente tem avaliação pendente
      if (mode === 'check-pending') {
        const clientName = url.searchParams.get('client_name')
        const clientPhone = url.searchParams.get('client_phone')
        const storeIdParam = url.searchParams.get('store_id')

        if (!clientName || !clientPhone) {
          return json({ success: false, message: 'Nome e telefone são obrigatórios' }, 400)
        }

        // Buscar cliente por telefone ou nome
        const storeIdForCheck = storeIdParam || null
        const clientsQuery = supabase
          .from('clients')
          .select('id')
          .or(`phone.eq.${clientPhone},name.ilike.%${clientName}%`)
          .limit(1)
        if (storeIdForCheck) clientsQuery.eq('store_id', storeIdForCheck)
        const { data: clients } = await clientsQuery

        if (!clients || clients.length === 0) {
          return json({ success: true, pending_token: null })
        }

        const clientId = clients[0].id

        // Buscar avaliação pendente mais recente do cliente (com ou sem OS)
        const { data: ratings } = await supabase
          .from('satisfaction_ratings')
          .select('public_token, responded_at')
          .eq('client_id', clientId)
          .is('responded_at', null)
          .order('created_at', { ascending: false })
          .limit(1)

        if (ratings && ratings.length > 0) {
          return json({ success: true, pending_token: ratings[0].public_token })
        }

        return json({ success: true, pending_token: null })
      }

      // Modo: Carregar lista de atendentes para o QR da loja
      if (mode === 'store-metadata') {
        console.log('🔍 Buscando staff members...')
        const { data: staff_members, error: staffError } = await supabase
          .from('staff_members')
          .select('id, name, photo_url')
          .order('name')

        console.log('📦 Staff members encontrados:', staff_members?.length || 0, 'Erro:', staffError)

        const { data: mechanics, error: mechanicsError } = await supabase
          .from('mechanics')
          .select('id, name')
          .order('name')

        console.log('🔧 Mechanics encontrados:', mechanics?.length || 0, 'Erro:', mechanicsError)

        return json({
          success: true,
          staff_members: staff_members || [],
          mechanics: mechanics || [],
        })
      }

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

      const { data: order } = row.order_id
        ? await supabase
            .from('service_orders')
            .select('id, client_name, equipment, problem_description, entry_date, client_phone, mechanic_id, atendimento_id')
            .eq('id', row.order_id)
            .single()
        : { data: null }

      const { data: client } = row.client_id
        ? await supabase
            .from('clients')
            .select('name, phone')
            .eq('id', row.client_id)
            .single()
        : { data: null }



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

      // Detectar se é walk-in: sem OS vinculada ou OS técnica de placeholder
      const isWalkIn = !row.order_id || order?.equipment === 'Avaliação de balcão' || order?.equipment === QR_PLACEHOLDER_EQUIPMENT;

      return json({
        success: true,
        alreadyResponded: !!row.responded_at,
        is_walk_in: isWalkIn,
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
          client_name: isWalkIn ? (client?.name || order?.client_name) : order?.client_name,
          equipment: isWalkIn ? 'Avaliação de balcão' : order?.equipment,
          problem_description: order?.problem_description,
          entry_date: order?.entry_date,
          client_phone: isWalkIn ? (client?.phone || order?.client_phone) : order?.client_phone,
        },
        mechanic: mechanic || null,
        atendimento: atendimento || null,
      })
    }

    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}))
      const mode = body?.mode

      // Modo: Criar walk-in (avaliação de balcão sem OS)
      if (mode === 'create_walkin') {
        console.log('🚀 Iniciando create_walkin...')
        const clientName = body?.client_name
        const clientPhone = body?.client_phone
        const attendantType = body?.attendant_type
        const attendantId = body?.attendant_id
        const requestedStoreId = body?.store_id

        console.log('Dados recebidos:', { clientName, clientPhone, attendantType, attendantId, requestedStoreId })

        if (!clientName || !clientPhone) {
          console.error('❌ Nome ou telefone faltando')
          return json({ success: false, message: 'Nome e telefone são obrigatórios' }, 400)
        }

        const storeId = await getStoreId(requestedStoreId)
        if (!storeId) {
          console.error('❌ store_id não encontrado')
          return json({ success: false, message: 'Loja não encontrada' }, 500)
        }

        // Buscar ou criar cliente
        console.log('🔍 Buscando cliente por telefone:', clientPhone)
        let clientId = null
        const { data: existingClients, error: clientSearchError } = await supabase
          .from('clients')
          .select('id')
          .eq('phone', clientPhone)
          .eq('store_id', storeId)
          .limit(1)

        console.log('Busca cliente:', { existingClients, clientSearchError })

        if (clientSearchError) {
          console.error('❌ Erro ao buscar cliente:', clientSearchError)
          return json({ success: false, message: `Erro ao buscar cliente: ${clientSearchError.message}` }, 500)
        }

        if (existingClients && existingClients.length > 0) {
          clientId = existingClients[0].id
          console.log('✅ Cliente encontrado:', clientId)
        } else {
          console.log('➕ Criando novo cliente...')

          // Gerar CPF fictício baseado no telefone (pegar últimos 11 dígitos ou completar com zeros)
          const phoneCPF = clientPhone.padStart(11, '0').slice(-11);

          const { data: newClient, error: createClientError } = await supabase
            .from('clients')
            .insert({
              store_id: storeId,
              name: clientName,
              phone: clientPhone,
              cpf: phoneCPF,
            })
            .select('id')
            .single()

          console.log('Novo cliente:', { newClient, createClientError })
          
          if (createClientError) {
            console.error('❌ Erro ao criar cliente:', createClientError)
            return json({ success: false, message: `Erro ao criar cliente: ${createClientError.message}` }, 500)
          }
          
          clientId = newClient?.id
        }

        if (!clientId) {
          console.error('❌ Falhou em obter client_id')
          return json({ success: false, message: 'Erro ao buscar/criar cliente' }, 500)
        }

        // Gerar token único para walk-in
        const publicToken = `walkin-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        console.log('🎟️ Token gerado:', publicToken)

        const ratingData: Record<string, unknown> = {
          store_id: storeId,
          order_id: null,
          client_id: clientId,
          public_token: publicToken,
          status: 'pendente',
        }

        // Se informou quem atendeu, preencher os IDs
        if (attendantType && attendantId) {
          if (attendantType === 'staff') {
            ratingData.atendimento_id = attendantId
          } else if (attendantType === 'mechanic') {
            ratingData.mechanic_id = attendantId
          }
        }

        let { data: newRating, error: ratingError } = await supabase
          .from('satisfaction_ratings')
          .insert(ratingData)
          .select('id, public_token')
          .single()

        // Fallback para bancos onde order_id ainda é NOT NULL.
        // Importante: satisfaction_ratings possui UNIQUE(order_id), então
        // cada avaliação precisa de uma OS placeholder própria.
        if (ratingError && (ratingError.code === '23502' || `${ratingError.message || ''}`.toLowerCase().includes('order_id'))) {
          console.warn('⚠️ order_id ainda obrigatório; criando OS placeholder por avaliação.')

          const { data: createdPlaceholder, error: createPlaceholderError } = await supabase
            .from('service_orders')
            .insert({
              store_id: storeId,
              client_id: null,
              client_name: 'SISTEMA QR',
              client_phone: '00000000000',
              client_address: '',
              equipment: QR_PLACEHOLDER_EQUIPMENT,
              problem_description: `OS técnica para avaliação walk-in via QR (${publicToken}).`,
              status: 'concluida',
              entry_date: new Date().toISOString(),
            })
            .select('id')
            .single()

          if (createPlaceholderError || !createdPlaceholder?.id) {
            console.error('❌ Erro ao criar OS placeholder:', createPlaceholderError)
            return json({ success: false, message: 'Erro ao iniciar avaliação' }, 500)
          }

          const { data: retryRating, error: retryError } = await supabase
            .from('satisfaction_ratings')
            .insert({
              ...ratingData,
              order_id: createdPlaceholder.id,
            })
            .select('id, public_token')
            .single()

          newRating = retryRating
          ratingError = retryError
        }

        if (ratingError || !newRating) {
          console.error('❌ Erro ao criar rating walk-in:', ratingError)
          return json({ success: false, message: `Erro ao criar avaliação: ${ratingError?.message || 'erro interno'}` }, 500)
        }

        return json({ success: true, token: newRating.public_token, client_id: clientId })
      }

      // Modo padrão: salvar resposta de avaliação
      const token = body?.token

      if (!token) return json({ success: false, message: 'Token ausente' }, 400)

      const atendimentoRating = Number(body?.atendimento_rating) || 0
      const servicoRating = Number(body?.servico_rating) || 0
      const storeRating = Number(body?.store_rating) || 0

      // Buscar registro antes de validar (precisamos saber se é walk-in)
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

      // Detectar se é walk-in para validar notas corretamente
      let isWalkInSubmit = !existing[0].order_id
      if (!isWalkInSubmit && existing[0].order_id) {
        const { data: orderCheck } = await supabase
          .from('service_orders')
          .select('equipment')
          .eq('id', existing[0].order_id)
          .single()
        isWalkInSubmit = orderCheck?.equipment === QR_PLACEHOLDER_EQUIPMENT || orderCheck?.equipment === 'Avaliação de balcão'
      }

      if (isWalkInSubmit) {
        // Walk-in: precisa ao menos uma nota válida ou um comentário
        const hasAttendantRating = atendimentoRating >= 1 && atendimentoRating <= 5
        const hasMechanicRating = servicoRating >= 1 && servicoRating <= 5
        const hasStoreRating = storeRating >= 1 && storeRating <= 5
        const hasComment = !!(body?.comment?.trim())
        if (!hasAttendantRating && !hasMechanicRating && !hasStoreRating && !hasComment) {
          return json({ success: false, message: 'Dê ao menos uma nota ou escreva um comentário.' }, 400)
        }
      } else {
        // OS normal: ambas as notas obrigatórias
        if (!(atendimentoRating >= 1 && atendimentoRating <= 5) || !(servicoRating >= 1 && servicoRating <= 5)) {
          return json({ success: false, message: 'Notas inválidas' }, 400)
        }
      }

      // Se mechanic_id ou atendimento_id estão vazios, buscar na ordem de serviço
      let mechanicId = existing[0].mechanic_id
      let atendimentoId = existing[0].atendimento_id

      // Se o cliente escolheu atendente agora (walk-in), sobrescrever
      const attendantType = body?.attendant_type
      const attendantId = body?.attendant_id
      const mechanicType = body?.mechanic_type
      const mechanicIdFromBody = body?.mechanic_id

      if (attendantType && attendantId) {
        if (attendantType === 'staff') {
          atendimentoId = attendantId
        } else if (attendantType === 'mechanic') {
          mechanicId = attendantId
        }
      }

      // Se selecionou mecânico separadamente (walk-in)
      if (mechanicType === 'mechanic' && mechanicIdFromBody) {
        mechanicId = mechanicIdFromBody
      }

      if ((!mechanicId || !atendimentoId) && existing[0].order_id) {
        // Fallback: buscar na OS se ainda não tem
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
          atendimento_rating: atendimentoRating || null,
          servico_rating: servicoRating || null,
          store_rating: (storeRating >= 1 && storeRating <= 5) ? storeRating : null,
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
