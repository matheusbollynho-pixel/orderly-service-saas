import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

// Roda diariamente — pausa lojas com pagamento vencido há mais de X dias de carência
const GRACE_DAYS = 3 // dias de carência após o vencimento

const UAZAPI_ADMIN_TOKEN = Deno.env.get('UAZAPI_ADMIN_TOKEN') || ''
const PLANOS_COM_WHATSAPP = ['pro', 'premium', 'enterprise']

// Apaga na UazAPI as instâncias criadas sozinhas (botão "Conectar WhatsApp")
// de lojas que não têm mais direito: pausadas, trial ou plano sem WhatsApp.
// Instância cadastrada à mão no SuperAdmin (whatsapp_instance_auto=false) nunca é tocada.
async function limparWhatsappSemDireito() {
  const { data: lojas } = await supabase
    .from('store_settings')
    .select('id, plan, active, custom_features, whatsapp_instance_url, whatsapp_instance_token')
    .eq('whatsapp_instance_auto', true)
  let apagadas = 0
  for (const l of lojas || []) {
    const custom = Array.isArray(l.custom_features) ? l.custom_features as string[] : null
    const temDireito = l.active && l.plan !== 'trial' && (custom ? custom.includes('pos-venda') : PLANOS_COM_WHATSAPP.includes(l.plan))
    if (temDireito) continue
    if (l.whatsapp_instance_url && l.whatsapp_instance_token) {
      const headers: Record<string, string> = { token: l.whatsapp_instance_token }
      if (UAZAPI_ADMIN_TOKEN) headers.admintoken = UAZAPI_ADMIN_TOKEN
      const res = await fetch(`${l.whatsapp_instance_url.replace(/\/$/, '')}/instance`, { method: 'DELETE', headers }).catch(() => null)
      // 404 = já não existe; qualquer outra falha tenta de novo amanhã
      if (!res || (!res.ok && res.status !== 404)) {
        console.error(`limparWhatsapp: falha ao apagar instância da loja ${l.id}: ${res?.status}`)
        continue
      }
    }
    await supabase
      .from('store_settings')
      .update({ whatsapp_instance_url: null, whatsapp_instance_token: null, whatsapp_instance_auto: false })
      .eq('id', l.id)
    apagadas++
  }
  if (apagadas) console.log(`🧹 ${apagadas} instância(s) de WhatsApp automática(s) removida(s) de lojas sem direito`)
  return apagadas
}

Deno.serve(async () => {
  const now = new Date()
  const graceCutoff = new Date(now)
  graceCutoff.setDate(graceCutoff.getDate() - GRACE_DAYS)
  const cutoff = graceCutoff.toISOString().split('T')[0] // YYYY-MM-DD

  console.log(`Verificando inadimplência — vencimentos antes de ${cutoff} (${GRACE_DAYS} dias de carência)`)

  // Busca assinaturas ativas com vencimento passado (além da carência)
  const { data: overdue, error } = await supabase
    .from('saas_subscriptions')
    .select('id, store_id, owner_email, plan, due_date')
    .eq('status', 'active')
    .not('due_date', 'is', null)
    .lt('due_date', cutoff)

  if (error) {
    console.error('Erro ao buscar assinaturas:', error.message)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  if (!overdue || overdue.length === 0) {
    console.log('Nenhuma assinatura vencida.')
    const whatsappRemovidos = await limparWhatsappSemDireito()
    return new Response(JSON.stringify({ paused: 0, whatsappRemovidos }), { status: 200 })
  }

  const storeIds = [...new Set(overdue.map((s: any) => s.store_id))]
  const subIds = overdue.map((s: any) => s.id)

  // Marca assinaturas como overdue
  await supabase
    .from('saas_subscriptions')
    .update({ status: 'overdue' })
    .in('id', subIds)

  // Desativa as lojas correspondentes
  await supabase
    .from('store_settings')
    .update({ active: false })
    .in('id', storeIds)

  console.log(`⚠️ ${storeIds.length} loja(s) pausada(s) por inadimplência:`, overdue.map((s: any) => `${s.store_id} (venc. ${s.due_date})`))

  const whatsappRemovidos = await limparWhatsappSemDireito()

  return new Response(JSON.stringify({
    paused: storeIds.length,
    whatsappRemovidos,
    stores: overdue.map((s: any) => ({ store_id: s.store_id, due_date: s.due_date, email: s.owner_email }))
  }), { status: 200 })
})
