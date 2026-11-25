// Aviso automático no WhatsApp do CLIENTE quando o preço especial dele (Lojista etc.) está para vencer.
// Chamado pelo cron a cada 10 min no horário comercial. SEM disparo em massa:
//   - no máximo 1 mensagem por loja a cada rodada (= 1 a cada 10 min por loja)
//   - intervalo aleatório entre lojas
// Cada cliente recebe 1 aviso por validade (tipo_aviso_para). Renovou → nova validade → novo aviso.
// Respeita: grupo com aviso ligado (aviso_dias), cliente que aceita lembretes, envios pausados da loja.
// Falhou o envio: tenta de novo nas próximas rodadas, até 3 vezes.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendWhatsAppText, normalizeBrPhone, type StoreWhatsAppConfig } from '../_shared/whatsapp.ts'
import { deveAvisar, montarAvisoLojista, primeiroNome, type CandidatoAviso } from '../_shared/avisoLojista.ts'

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

// Loja "dona" da instância global compartilhada (legado, pré multi-tenant).
const LEGACY_DEFAULT_STORE_ID = '9fd27114-97d1-48cd-ad09-1b057fa9c185'

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)) }
function hojeLoja(): string { return new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10) }
function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + dias); return d.toISOString().slice(0, 10)
}

type Cliente = CandidatoAviso & {
  id: string
  store_id: string
  name: string
  apelido: string | null
  tipo_cliente_id: string
  tipos_cliente: CandidatoAviso['tipos_cliente'] & { nome: string; compra_minima: number; aviso_texto: string | null }
}
interface Loja {
  id: string
  company_name: string | null
  whatsapp_provider: string | null
  whatsapp_instance_url: string | null
  whatsapp_instance_token: string | null
  whatsapp_bulk_paused: boolean | null
  whatsapp_lojista_aviso_template: string | null
}

Deno.serve(async (req) => {
  // Só o cron chama (segredo enviado por public.cron_http, lido do Vault)
  const segredo = Deno.env.get('CRON_SECRET')
  if (!segredo || req.headers.get('x-cron-secret') !== segredo) {
    return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 })
  }
  try {
    const hoje = hojeLoja()
    // Candidatos de todas as lojas: com grupo e validade nos próximos 60 dias (o filtro fino é deveAvisar)
    const { data, error } = await supabase
      .from('clients')
      .select('id, store_id, name, apelido, phone, whatsapp, active, autoriza_lembretes, tipo_cliente_id, tipo_valido_ate, tipo_aviso_para, tipo_aviso_tentativas, tipos_cliente(nome, ativo, validade_dias, compra_minima, aviso_dias, aviso_texto)')
      .not('tipo_cliente_id', 'is', null)
      .gte('tipo_valido_ate', hoje)
      .lte('tipo_valido_ate', somarDias(hoje, 60))
      .lt('tipo_aviso_tentativas', 3)
      .order('tipo_valido_ate', { ascending: true })
      .limit(1000)
    if (error) throw error

    // 1 por loja nesta rodada (o que vence primeiro)
    const porLoja = new Map<string, Cliente>()
    for (const c of (data ?? []) as unknown as Cliente[]) {
      if (porLoja.has(c.store_id) || !deveAvisar(c, hoje)) continue
      porLoja.set(c.store_id, c)
    }
    if (porLoja.size === 0) return new Response(JSON.stringify({ ok: true, hoje, enviados: 0 }), { headers: { 'Content-Type': 'application/json' } })

    const { data: lojas, error: e2 } = await supabase
      .from('store_settings')
      .select('id, company_name, whatsapp_provider, whatsapp_instance_url, whatsapp_instance_token, whatsapp_bulk_paused, whatsapp_lojista_aviso_template')
      .in('id', [...porLoja.keys()])
      .eq('active', true)
    if (e2) throw e2

    let enviados = 0, falhas = 0, pulados = 0
    let primeira = true
    for (const loja of (lojas ?? []) as Loja[]) {
      const c = porLoja.get(loja.id)!
      if (loja.whatsapp_bulk_paused) { pulados++; continue }
      if (!loja.whatsapp_instance_url && loja.id !== LEGACY_DEFAULT_STORE_ID) { pulados++; continue }
      const t = c.tipos_cliente!
      // Texto: Engrenagem > Mensagens > Preço especial vencendo (vazio = padrão)
      const msg = montarAvisoLojista(loja.whatsapp_lojista_aviso_template || t.aviso_texto, {
        nome: c.apelido?.trim() || primeiroNome(c.name),
        grupo: t.nome,
        loja: loja.company_name || 'nossa loja',
        validoAte: c.tipo_valido_ate!,
        hoje,
        compraMinima: Number(t.compra_minima) || 0,
        validadeDias: Number(t.validade_dias) || 0,
      })
      // Sem rajada entre lojas
      if (!primeira) await sleep(4000 + Math.random() * 6000)
      primeira = false
      const wppConfig: StoreWhatsAppConfig = {
        provider: loja.whatsapp_provider || undefined,
        instance_url: loja.whatsapp_instance_url || undefined,
        instance_token: loja.whatsapp_instance_token || undefined,
      }
      try {
        await sendWhatsAppText(normalizeBrPhone(c.whatsapp || c.phone!), msg, wppConfig, { storeId: loja.id, feature: 'lojista_vencimento' })
        await supabase.from('clients').update({ tipo_aviso_para: c.tipo_valido_ate, tipo_aviso_em: new Date().toISOString(), tipo_aviso_tentativas: 0 }).eq('id', c.id)
        enviados++
      } catch (err) {
        console.error(`lojista-aviso: falhou para cliente ${c.id} da loja ${loja.id}:`, err)
        await supabase.from('clients').update({ tipo_aviso_tentativas: (c.tipo_aviso_tentativas ?? 0) + 1 }).eq('id', c.id)
        falhas++
      }
    }
    return new Response(JSON.stringify({ ok: true, hoje, enviados, falhas, pulados }), { headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('lojista-aviso-vencimento error:', err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
