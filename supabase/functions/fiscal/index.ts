// Notas fiscais: emitir / atualizar / cancelar NFC-e (balcão). Só o servidor tem as chaves do fornecedor.
// Ações (POST JSON):
//   { acao: 'emitir_nfce', balcao_order_id, cpf? }
//   { acao: 'atualizar', nota_id }
//   { acao: 'cancelar', nota_id, motivo }   (mín. 15 caracteres; quem pode estornar)
// A loja é sempre a do usuário logado; módulo fiscal precisa estar ligado na loja.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { strToU8, zipSync } from 'https://esm.sh/fflate@0.8.2'
import { pecasDaOs } from '../_shared/fiscal/os.ts'
import { agoraBrasilia, autorizadosXml, montarNfce, montarNfe, spedy, type Destinatario, type ItemVenda, type PadroesFiscais, type Ambiente, type RetornoNota } from '../_shared/fiscal/spedy.ts'

const URL = Deno.env.get('SUPABASE_URL')!
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('CORS_ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
}
const resp = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json', ...cors } })
const erro = (msg: string, status = 400) => resp({ error: msg }, status)

const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })

// Grava o que o fornecedor devolveu na nossa nota
async function salvarRetorno(notaId: string, r: RetornoNota) {
  // Nota já cancelada não perde o horário/protocolo de autorização (a Spedy devolve a autorização original)
  await admin.from('notas_fiscais').update({
    fornecedor_nota_id: r.idFornecedor, status: r.status, numero: r.numero, serie: r.serie, chave: r.chave,
    ...(r.status !== 'cancelada' ? { protocolo: r.protocolo, autorizada_em: r.autorizadaEm } : {}),
    motivo: r.motivo, updated_at: new Date().toISOString(),
  }).eq('id', notaId)
  // Cancelamento confirmado na consulta: grava quando (só da primeira vez)
  if (r.status === 'cancelada') {
    await admin.from('notas_fiscais').update({ cancelada_em: new Date().toISOString() }).eq('id', notaId).is('cancelada_em', null)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') return erro('Método não permitido', 405)
  try {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
    if (!token) return erro('Não autorizado', 401)
    const { data: u } = await admin.auth.getUser(token)
    if (!u?.user) return erro('Não autorizado', 401)
    // Cliente com o login do usuário: a loja e as permissões vêm do banco, nunca do pedido
    const comoUsuario = createClient(URL, ANON, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } })
    const p = await req.json().catch(() => null) as Record<string, string> | null
    if (!p?.acao) return erro('Ação não informada')

    const { data: minhaLoja } = await comoUsuario.rpc('get_my_store_id')
    let loja = minhaLoja as string | null
    // Contador: escolhe a loja (store_id), mas só vale se o dono dela liberou o acesso. Só baixa XMLs.
    let comoContador = false
    if (p.store_id && p.store_id !== loja) {
      const { data: acesso } = await admin.from('contador_acessos').select('id')
        .eq('user_id', u.user.id).eq('store_id', p.store_id).eq('ativo', true).maybeSingle()
      if (!acesso) return erro('Você não tem acesso às notas desta loja.', 403)
      loja = p.store_id
      comoContador = true
      if (p.acao !== 'xmls_periodo') return erro('O acesso de contador só permite consultar e baixar as notas.', 403)
    }
    if (!loja) return erro('Usuário sem loja', 403)

    const { data: cfg } = await admin.from('store_settings')
      .select('fiscal_ativo, fiscal_ambiente, fiscal_ncm_padrao, fiscal_cfop_padrao, fiscal_csosn_padrao, fiscal_origem_padrao, fiscal_regime, fiscal_icms_aliquota, fiscal_pis_cofins_cst, fiscal_pis_aliquota, fiscal_cofins_aliquota, fiscal_fcp_aliquota, fiscal_contador_doc')
      .eq('id', loja).single()
    if (!cfg?.fiscal_ativo) return erro('O módulo de nota fiscal não está ativo nesta loja.', 403)
    const amb = cfg.fiscal_ambiente as Ambiente

    // Chave da Spedy do emissor: a da empresa PRINCIPAL da conta (manda em todas) vem só do segredo da função;
    // as demais vêm do Vault (criptografadas), lidas por função que só o servidor executa.
    const chaveDoEmissor = async (emissorId: string) => {
      const { data: em } = await admin.from('fiscal_emissores').select('ambiente, usa_chave_principal').eq('id', emissorId).single()
      if (em?.usa_chave_principal) {
        const k = Deno.env.get(em.ambiente === 'producao' ? 'SPEDY_OWNER_KEY_PRODUCAO' : 'SPEDY_OWNER_KEY_SANDBOX')
        if (!k) throw new Error('Chave principal do emissor não configurada no servidor. Fale com o suporte.')
        return k
      }
      const { data: chave } = await admin.rpc('fiscal_ler_chave', { p_emissor: emissorId })
      if (!chave) throw new Error('Emissor sem chave cadastrada. Fale com o suporte.')
      return chave as string
    }

    // ---------------------------------------------------------------- partes comuns NFC-e / NF-e
    const padroes = (): PadroesFiscais => ({
      ncm: cfg.fiscal_ncm_padrao, cfop: cfg.fiscal_cfop_padrao, csosn: cfg.fiscal_csosn_padrao,
      origem: cfg.fiscal_origem_padrao, pisCofinsCst: 49,
      regime: cfg.fiscal_regime === 'normal' ? 'normal' : 'simples',
      icmsAliquota: cfg.fiscal_icms_aliquota != null ? Number(cfg.fiscal_icms_aliquota) : null,
      pisCofinsCstNormal: Number(cfg.fiscal_pis_cofins_cst ?? 1),
      pisAliquota: Number(cfg.fiscal_pis_aliquota ?? 0.65),
      cofinsAliquota: Number(cfg.fiscal_cofins_aliquota ?? 3),
      fcpAliquota: cfg.fiscal_fcp_aliquota != null ? Number(cfg.fiscal_fcp_aliquota) : null,
    })
    // Itens com os dados fiscais do cadastro do produto (item digitado à mão usa os padrões da loja)
    const itensComFiscal = async (linhas: { description: string; quantity: number; unit_price: number; product_id: string | null }[]): Promise<ItemVenda[]> => {
      const ids = [...new Set(linhas.map((i) => i.product_id).filter(Boolean))] as string[]
      const { data: prods } = ids.length
        ? await admin.from('inventory_products').select('id, code, barcode, unit, ncm, cest, cfop, csosn, origem_fiscal, pis_cofins_cst').eq('store_id', loja).in('id', ids)
        : { data: [] }
      const porId = new Map((prods ?? []).map((x: Record<string, unknown>) => [x.id as string, x]))
      return linhas.map((i) => {
        const pr = (i.product_id ? porId.get(i.product_id) : null) as Record<string, unknown> | null
        return {
          codigo: String(pr?.code ?? ''), descricao: String(i.description ?? '').trim() || 'ITEM', quantidade: Number(i.quantity), valorUnitario: Number(i.unit_price),
          unidade: String(pr?.unit ?? 'UN'), ncm: (pr?.ncm as string) ?? null, cfop: (pr?.cfop as string) ?? null,
          csosn: (pr?.csosn as string) ?? null, origem: pr?.origem_fiscal != null ? Number(pr.origem_fiscal) : null,
          gtin: (pr?.barcode as string) ?? null, cest: (pr?.cest as string) ?? null,
          pisCofinsCst: pr?.pis_cofins_cst != null ? Number(pr.pis_cofins_cst) : null,
        }
      })
    }
    const formasDaVenda = (venda: { payment_methods: unknown; payment_method: string | null }) =>
      Array.isArray(venda.payment_methods) && venda.payment_methods.length
        ? (venda.payment_methods as { method: string; amount: number }[]).map((x) => ({ forma: x.method, valor: Number(x.amount) || 0 }))
        : [{ forma: venda.payment_method ?? 'dinheiro', valor: 0 }]
    const MORTAS = ['rejeitada', 'denegada', 'cancelada', 'erro', 'inutilizada']

    // De onde vêm os itens da nota: venda do balcão ou OS (só as peças). Devolve texto = erro para o usuário.
    type Fonte = {
      coluna: 'balcao_order_id' | 'order_id'; id: string; origem: 'balcao' | 'os' | 'site'; nome: string
      itens: ItemVenda[]; desconto: number; formas: { forma: string; valor: number }[]; cpf: string | null; online: boolean
    }
    const carregarFonte = async (balcaoId?: string | null, osId?: string | null): Promise<Fonte | string> => {
      if (osId) {
        const { data: os } = await admin.from('service_orders')
          .select('id, status, client_cpf, materials(descricao, quantidade, valor, is_service, product_id), payments(method, amount, discount_amount)')
          .eq('id', osId).eq('store_id', loja).maybeSingle()
        if (!os) return 'OS não encontrada.'
        if (!['concluida', 'concluida_entregue'].includes(os.status)) return 'Só dá para emitir nota de OS pronta ou entregue.'
        const pc = pecasDaOs(os.materials ?? [], os.payments ?? [])
        if (!pc.linhas.length) return 'Esta OS não tem peças com valor. A mão de obra vai na nota de serviço (NFS-e).'
        return {
          coluna: 'order_id', id: os.id, origem: 'os', nome: 'OS', itens: await itensComFiscal(pc.linhas), desconto: pc.descontoPecas,
          formas: pc.formas.length ? pc.formas : [{ forma: 'dinheiro', valor: 0 }], cpf: os.client_cpf ?? null, online: false,
        }
      }
      const { data: venda } = await admin.from('balcao_orders')
        .select('id, status, discount_amount, payment_method, payment_methods, client_cpf, venda_online, balcao_items(description, quantity, unit_price, product_id)')
        .eq('id', balcaoId).eq('store_id', loja).maybeSingle()
      if (!venda) return 'Venda não encontrada.'
      if (venda.status !== 'finalizada') return 'Só dá para emitir nota de venda finalizada.'
      return {
        coluna: 'balcao_order_id', id: venda.id, origem: venda.venda_online ? 'site' : 'balcao', nome: 'venda',
        itens: await itensComFiscal(venda.balcao_items ?? []), desconto: Number(venda.discount_amount) || 0,
        formas: formasDaVenda(venda), cpf: venda.client_cpf ?? null, online: !!venda.venda_online,
      }
    }

    // ---------------------------------------------------------------- emitir NFC-e de uma venda do balcão
    if (p.acao === 'emitir_nfce') {
      const { data: podeVender } = await comoUsuario.rpc('pode_acao', { acao: 'balcao' })
      if (podeVender !== true) return erro('Sem permissão de Balcão para emitir nota.', 403)
      const { data: emissor } = await admin.from('fiscal_emissores').select('id, uf')
        .eq('store_id', loja).eq('papel', 'vendas').eq('ambiente', amb).eq('ativo', true).maybeSingle()
      if (!emissor) return erro('Nenhum CNPJ de vendas configurado para emitir nota nesta loja.')
      const fonte = await carregarFonte(p.balcao_order_id, p.order_id)
      if (typeof fonte === 'string') return erro(fonte)

      // Já tem nota viva desta venda/OS?
      const { data: anteriores } = await admin.from('notas_fiscais').select('id, status, modelo')
        .eq(fonte.coluna, fonte.id).order('created_at', { ascending: false })
      const viva = (anteriores ?? []).find((n) => !MORTAS.includes(n.status))
      if (viva) return erro(viva.status === 'autorizada' ? `Esta ${fonte.nome} já tem ${viva.modelo === 'nfe' ? 'NF-e' : 'nota'} autorizada.` : `Esta ${fonte.nome} já tem nota em processamento.`)
      // Tentativa que deu ERRO no envio (Spedy pode ou não ter recebido): reenvia com o MESMO id, sem risco de nota duplicada.
      // Nota REJEITADA pela SEFAZ não é reaproveitada: a Spedy mantém o horário antigo e a SEFAZ recusa NFC-e atrasada (704).
      // Então vira nota nova (próximo número); o número da rejeitada fica para inutilizar.
      const rejeitada = (anteriores ?? []).find((n) => n.status === 'erro' && n.modelo === 'nfce')


      // Registro antes de enviar (o id dele é o identificador no fornecedor = sem nota duplicada)
      let notaId = rejeitada?.id as string | undefined
      if (!notaId) {
        const { data: nova, error } = await admin.from('notas_fiscais').insert({
          store_id: loja, emissor_id: emissor.id, modelo: 'nfce', origem: fonte.origem,
          [fonte.coluna]: fonte.id, ambiente: amb, status: 'processando', created_by: u.user.id,
          cpf_cnpj_cliente: (p.cpf || fonte.cpf || '').replace(/\D/g, '') || null,
        }).select('id').single()
        if (error) return erro(error.code === '23505' ? `Esta ${fonte.nome} já tem nota em processamento.` : error.message)
        notaId = nova.id
      } else {
        await admin.from('notas_fiscais').update({
          status: 'processando', motivo: null, updated_at: new Date().toISOString(),
          cpf_cnpj_cliente: (p.cpf || fonte.cpf || '').replace(/\D/g, '') || null,
        }).eq('id', notaId)
      }

      let corpo
      try {
        corpo = montarNfce({
          idIntegracao: notaId!, itens: fonte.itens, desconto: fonte.desconto, pagamentos: fonte.formas,
          cpf: p.cpf || fonte.cpf, online: fonte.online, emitidaEm: agoraBrasilia(),
          autorizadosXml: autorizadosXml(cfg.fiscal_contador_doc, emissor.uf),
        }, padroes())
      } catch (e) {
        await admin.from('notas_fiscais').update({ status: 'erro', motivo: String((e as Error).message) }).eq('id', notaId)
        return erro((e as Error).message)
      }
      const valor = corpo.total.invoiceAmount
      await admin.from('notas_fiscais').update({ valor }).eq('id', notaId)
      try {
        const r = await spedy.emitirNfce(amb, await chaveDoEmissor(emissor.id), corpo)
        await salvarRetorno(notaId!, r)
        return resp({ nota_id: notaId, ...r })
      } catch (e) {
        await admin.from('notas_fiscais').update({ status: 'erro', motivo: String((e as Error).message).slice(0, 500) }).eq('id', notaId)
        return erro((e as Error).message, 502)
      }
    }

    // ---------------------------------------------------------------- emitir NF-e (cliente com CNPJ): de uma venda ou avulsa
    // Corpo: { acao:'emitir_nfe', destinatario:{...}, balcao_order_id? , itens?:[{descricao,quantidade,valor_unitario,product_id?}],
    //          forma?, desconto?, consumidor_final?, observacao? }
    if (p.acao === 'emitir_nfe') {
      const q = p as unknown as {
        destinatario?: Destinatario; balcao_order_id?: string; order_id?: string; itens?: { descricao: string; quantidade: number; valor_unitario: number; product_id?: string | null }[]
        forma?: string; desconto?: number; consumidor_final?: boolean; observacao?: string
      }
      const { data: podeVender } = await comoUsuario.rpc('pode_acao', { acao: 'balcao' })
      if (podeVender !== true) return erro('Sem permissão de Balcão para emitir nota.', 403)
      if (!q.destinatario) return erro('Informe os dados do cliente (destinatário).')
      const { data: emissor } = await admin.from('fiscal_emissores').select('id, uf, fornecedor_empresa_id')
        .eq('store_id', loja).eq('papel', 'vendas').eq('ambiente', amb).eq('ativo', true).maybeSingle()
      if (!emissor) return erro('Nenhum CNPJ de vendas configurado para emitir nota nesta loja.')
      const chave = await chaveDoEmissor(emissor.id)
      // UF da loja: guardada no emissor; se não tiver, pergunta à Spedy uma vez e guarda
      let ufEmitente = String(emissor.uf ?? '')
      if (ufEmitente.length !== 2) {
        ufEmitente = (await spedy.ufDaEmpresa(amb, chave, emissor.fornecedor_empresa_id).catch(() => '')) || ''
        if (ufEmitente) await admin.from('fiscal_emissores').update({ uf: ufEmitente }).eq('id', emissor.id)
      }

      let itens: ItemVenda[]
      let desconto = 0
      let pagamentos: { forma: string; valor: number }[]
      let reaproveitar: string | undefined
      let fonte: Fonte | null = null
      if (q.balcao_order_id || q.order_id) {
        const f = await carregarFonte(q.balcao_order_id, q.order_id)
        if (typeof f === 'string') return erro(f)
        fonte = f
        const { data: anteriores } = await admin.from('notas_fiscais').select('id, status, modelo')
          .eq(f.coluna, f.id).order('created_at', { ascending: false })
        const viva = (anteriores ?? []).find((n) => !MORTAS.includes(n.status))
        if (viva) return erro(viva.modelo === 'nfce' ? `Esta ${f.nome} já tem NFC-e (cupom). Cancele o cupom antes de emitir a NF-e.` : `Esta ${f.nome} já tem NF-e.`)
        // NF-e rejeitada pode ser corrigida com o MESMO id (a SEFAZ aceita NF-e com data de até 30 dias): não pula número
        reaproveitar = (anteriores ?? []).find((n) => n.modelo === 'nfe' && (n.status === 'rejeitada' || n.status === 'erro'))?.id
        itens = f.itens
        desconto = f.desconto
        pagamentos = f.formas
      } else {
        const lista = Array.isArray(q.itens) ? q.itens : []
        if (!lista.length || lista.length > 100) return erro('Informe de 1 a 100 itens.')
        if (lista.some((i) => !(Number(i.quantidade) > 0) || !(Number(i.valor_unitario) >= 0))) return erro('Quantidade e valor dos itens precisam ser números válidos.')
        itens = await itensComFiscal(lista.map((i) => ({ description: i.descricao, quantity: Number(i.quantidade), unit_price: Number(i.valor_unitario), product_id: i.product_id ?? null })))
        desconto = Math.max(0, Number(q.desconto) || 0)
        pagamentos = [{ forma: q.forma || 'transferencia', valor: 0 }]
      }

      const doc = String(q.destinatario.documento ?? '').replace(/\D/g, '')
      let notaId = reaproveitar
      if (!notaId) {
        const { data: nova, error } = await admin.from('notas_fiscais').insert({
          store_id: loja, emissor_id: emissor.id, modelo: 'nfe', origem: fonte ? (fonte.origem === 'site' ? 'balcao' : fonte.origem) : 'manual',
          ...(fonte ? { [fonte.coluna]: fonte.id } : {}), ambiente: amb, status: 'processando', created_by: u.user.id,
          cpf_cnpj_cliente: doc || null, destinatario_nome: String(q.destinatario.nome ?? '').slice(0, 120) || null,
        }).select('id').single()
        if (error) return erro(error.code === '23505' ? 'Esta venda já tem nota em processamento.' : error.message)
        notaId = nova.id
      } else {
        await admin.from('notas_fiscais').update({ status: 'processando', motivo: null, cpf_cnpj_cliente: doc || null, destinatario_nome: String(q.destinatario.nome ?? '').slice(0, 120) || null, updated_at: new Date().toISOString() }).eq('id', notaId)
      }
      let corpo
      try {
        corpo = montarNfe({
          idIntegracao: notaId!, itens, desconto, pagamentos, emitidaEm: agoraBrasilia(),
          destinatario: q.destinatario, ufEmitente, consumidorFinal: q.consumidor_final, observacao: q.observacao ?? null,
          autorizadosXml: autorizadosXml(cfg.fiscal_contador_doc, ufEmitente),
        }, padroes())
      } catch (e) {
        await admin.from('notas_fiscais').update({ status: 'erro', motivo: String((e as Error).message) }).eq('id', notaId)
        return erro((e as Error).message)
      }
      await admin.from('notas_fiscais').update({ valor: corpo.total.invoiceAmount }).eq('id', notaId)
      try {
        const r = await spedy.emitirNfe(amb, chave, corpo)
        await salvarRetorno(notaId!, r)
        return resp({ nota_id: notaId, ...r })
      } catch (e) {
        await admin.from('notas_fiscais').update({ status: 'erro', motivo: String((e as Error).message).slice(0, 500) }).eq('id', notaId)
        return erro((e as Error).message, 502)
      }
    }

    // ---------------------------------------------------------------- acesso do contador (só o DONO libera / tira)
    // { acao:'contador_convidar', email } | { acao:'contador_remover', acesso_id }
    // O contador ganha login próprio (convite por e-mail) que só lê as notas desta loja; não entra na equipe.
    if (p.acao === 'contador_convidar' || p.acao === 'contador_remover') {
      const { data: membro } = await admin.from('store_members').select('role')
        .eq('user_id', u.user.id).eq('store_id', loja).eq('active', true).maybeSingle()
      if (membro?.role !== 'owner') return erro('Só o dono da loja libera ou tira o acesso do contador.', 403)

      if (p.acao === 'contador_remover') {
        const { data: tirado, error } = await admin.from('contador_acessos')
          .update({ ativo: false, removido_em: new Date().toISOString() })
          .eq('id', String(p.acesso_id ?? '')).eq('store_id', loja).select('id')
        if (error) return erro(error.message)
        if (!tirado?.length) return erro('Acesso não encontrado.', 404)
        return resp({ ok: true })
      }

      const email = String(p.email ?? '').trim().toLowerCase()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return erro('Digite um e-mail válido.')
      if (email === (u.user.email ?? '').toLowerCase()) return erro('Esse é o seu próprio e-mail. Use o e-mail do contador.')
      const { data: lojaInfo } = await admin.from('store_settings').select('company_name').eq('id', loja).single()

      // Login novo: convite por e-mail (ele cria a senha). Já tem login (atende outra loja): só libera esta.
      let userId: string | undefined
      let convidou = false
      const { data: convite, error: convErr } = await admin.auth.admin.inviteUserByEmail(email, {
        data: { contador: true, company_name: lojaInfo?.company_name ?? null },
        redirectTo: 'https://app.speedseekos.com.br/',
      })
      if (!convErr && convite?.user) {
        userId = convite.user.id
        convidou = true
      } else {
        for (let pagina = 1; pagina <= 20 && !userId; pagina++) {
          const { data: lista } = await admin.auth.admin.listUsers({ page: pagina, perPage: 1000 })
          const usuarios = lista?.users ?? []
          userId = usuarios.find((x: { email?: string }) => (x.email ?? '').toLowerCase() === email)?.id
          if (usuarios.length < 1000) break
        }
        if (!userId) return erro(`Não consegui mandar o convite: ${convErr?.message ?? 'erro desconhecido'}`, 502)
      }

      const { data: daEquipe } = await admin.from('store_members').select('id')
        .eq('user_id', userId).eq('store_id', loja).eq('active', true).maybeSingle()
      if (daEquipe) return erro('Esse e-mail já é de alguém da equipe desta loja. Use o e-mail do contador.')

      const { error: gravErr } = await admin.from('contador_acessos').upsert({
        user_id: userId, store_id: loja, email, ativo: true, convidado_por: u.user.id, removido_em: null,
      }, { onConflict: 'user_id,store_id' })
      if (gravErr) return erro(gravErr.message)
      return resp({ ok: true, convidou })
    }

    // ---------------------------------------------------------------- XMLs do período para o contador (.zip)
    // Corpo: { acao:'xmls_periodo', de:'AAAA-MM-DD', ate:'AAAA-MM-DD' }. Autorizadas e canceladas + planilha resumo.
    if (p.acao === 'xmls_periodo') {
      if (!comoContador) {
        const { data: pode } = await comoUsuario.rpc('pode_acao', { acao: 'relatorios' })
        if (pode !== true) return erro('Sem permissão de Relatórios para baixar os XMLs.', 403)
      }
      const de = String(p.de ?? ''), ate = String(p.ate ?? '')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(de) || !/^\d{4}-\d{2}-\d{2}$/.test(ate) || ate < de) return erro('Período inválido.')
      const fim = new Date(`${ate}T00:00:00-03:00`); fim.setDate(fim.getDate() + 1)
      if ((fim.getTime() - new Date(`${de}T00:00:00-03:00`).getTime()) / 86_400_000 > 93) return erro('Escolha no máximo 3 meses por vez.')
      const { data: notas, error } = await admin.from('notas_fiscais')
        .select('id, modelo, ambiente, fornecedor_nota_id, status, numero, serie, chave, valor, cpf_cnpj_cliente, destinatario_nome, autorizada_em, cancelada_em, cancel_motivo, created_at')
        .eq('store_id', loja).in('status', ['autorizada', 'cancelada']).not('fornecedor_nota_id', 'is', null)
        .gte('created_at', `${de}T00:00:00-03:00`).lt('created_at', fim.toISOString()).order('created_at').limit(3000)
      if (error) return erro(error.message)
      const { data: inuts } = await admin.from('fiscal_inutilizacoes').select('modelo, serie, numero_de, numero_ate, motivo, status, protocolo, created_at')
        .eq('store_id', loja).gte('created_at', `${de}T00:00:00-03:00`).lt('created_at', fim.toISOString()).order('created_at')
      if (!(notas ?? []).length && !(inuts ?? []).length) return erro('Nenhuma nota autorizada ou cancelada nesse período.')

      const arquivos: Record<string, Uint8Array> = {}
      const falhas: string[] = []
      const lista = notas ?? []
      // Baixa 8 XMLs por vez direto do fornecedor (link público da nota)
      for (let i = 0; i < lista.length; i += 8) {
        await Promise.all(lista.slice(i, i + 8).map(async (n) => {
          try {
            const r = await fetch(spedy.urlXml(n.ambiente as Ambiente, n.modelo as 'nfce' | 'nfe', n.fornecedor_nota_id!))
            if (!r.ok) throw new Error(String(r.status))
            const pasta = n.modelo === 'nfe' ? 'NF-e' : 'NFC-e'
            arquivos[`${pasta}/${n.status === 'cancelada' ? 'canceladas/' : ''}${n.chave || `${n.modelo}-${n.serie}-${n.numero}`}.xml`] = new Uint8Array(await r.arrayBuffer())
          } catch { falhas.push(`${n.modelo} ${n.serie}-${n.numero}`) }
        }))
      }
      const csv = (linhas: (string | number | null | undefined)[][]) =>
        '\ufeff' + linhas.map((l) => l.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n')
      const dataBr = (s: string | null) => (s ? new Date(s).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '')
      arquivos['resumo-notas.csv'] = strToU8(csv([
        ['Modelo', 'Série', 'Número', 'Status', 'Emitida em', 'Autorizada em', 'Cancelada em', 'Motivo do cancelamento', 'Valor', 'Cliente', 'CPF/CNPJ', 'Chave de acesso'],
        ...lista.map((n) => [n.modelo === 'nfe' ? 'NF-e' : 'NFC-e', n.serie, n.numero, n.status, dataBr(n.created_at), dataBr(n.autorizada_em), dataBr(n.cancelada_em), n.cancel_motivo,
          String(n.valor ?? '').replace('.', ','), n.destinatario_nome, n.cpf_cnpj_cliente, n.chave]),
      ]))
      if ((inuts ?? []).length) {
        arquivos['inutilizacoes.csv'] = strToU8(csv([
          ['Modelo', 'Série', 'De', 'Até', 'Status', 'Protocolo', 'Motivo', 'Pedido em'],
          ...(inuts ?? []).map((x) => [x.modelo === 'nfe' ? 'NF-e' : 'NFC-e', x.serie, x.numero_de, x.numero_ate, x.status, x.protocolo, x.motivo, dataBr(x.created_at)]),
        ]))
      }
      arquivos['LEIA-ME.txt'] = strToU8([
        `XMLs das notas fiscais de ${de.split('-').reverse().join('/')} a ${ate.split('-').reverse().join('/')}.`,
        'Pastas NFC-e e NF-e: XML autorizado de cada nota. Subpasta "canceladas": notas que foram canceladas depois (o evento de cancelamento está na SEFAZ; dados no resumo-notas.csv).',
        falhas.length ? `ATENÇÃO: não consegui baixar ${falhas.length} XML(s): ${falhas.join(', ')}. Baixe de novo mais tarde.` : 'Todos os XMLs foram baixados.',
      ].join('\r\n'))
      const zip = zipSync(arquivos, { level: 6 })
      let bin = ''
      for (let i = 0; i < zip.length; i += 0x8000) bin += String.fromCharCode(...zip.subarray(i, i + 0x8000))
      return resp({ nome: `notas-fiscais-${de}-a-${ate}.zip`, base64: btoa(bin), total: lista.length, falhas: falhas.length })
    }

    // ---------------------------------------------------------------- certificado A1 (só o DONO da loja)
    // Arquivo e senha vão direto para a Spedy: nada é gravado aqui nem aparece em registro de erro.
    if (p.acao === 'enviar_certificado' || p.acao === 'ver_certificado') {
      const { data: membro } = await admin.from('store_members').select('role')
        .eq('user_id', u.user.id).eq('store_id', loja).eq('active', true).maybeSingle()
      if (membro?.role !== 'owner') return erro('Só o dono da loja mexe no certificado digital.', 403)
      const { data: emissor } = await admin.from('fiscal_emissores').select('id, cnpj, fornecedor_empresa_id, usa_chave_principal')
        .eq('store_id', loja).eq('papel', p.papel === 'servicos' ? 'servicos' : 'vendas').eq('ambiente', amb).eq('ativo', true).maybeSingle()
      if (!emissor) return erro('Nenhum CNPJ configurado para emitir nesta loja. Fale com o suporte.')
      const chaveEmissor = await chaveDoEmissor(emissor.id)
      const chavePrincipal = Deno.env.get(amb === 'producao' ? 'SPEDY_OWNER_KEY_PRODUCAO' : 'SPEDY_OWNER_KEY_SANDBOX')

      if (p.acao === 'enviar_certificado') {
        const senha = String(p.senha ?? '')
        const b64 = String(p.arquivo_base64 ?? '').replace(/^data:[^,]*,/, '')
        if (!b64 || !senha) return erro('Escolha o arquivo do certificado (.pfx) e digite a senha.')
        let bytes: Uint8Array
        try { bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)) } catch { return erro('Arquivo do certificado inválido.') }
        if (bytes.length < 500 || bytes.length > 50_000) return erro('Esse arquivo não parece um certificado A1 (.pfx).')
        const nome = /\.(pfx|p12)$/i.test(String(p.nome_arquivo ?? '')) ? String(p.nome_arquivo) : 'certificado.pfx'
        try {
          await spedy.enviarCertificado(amb, chaveEmissor, emissor.fornecedor_empresa_id, bytes, nome, senha)
        } catch (e) {
          // Chave de empresa secundária pode não ter permissão: tenta com a chave principal da conta (segredo do servidor)
          const st = (e as { status?: number }).status
          if ((st === 401 || st === 403) && chavePrincipal && !emissor.usa_chave_principal) {
            await spedy.enviarCertificado(amb, chavePrincipal, emissor.fornecedor_empresa_id, bytes, nome, senha)
          } else return erro((e as Error).message)
        }
      }

      const cert = await spedy.listarCertificados(amb, chaveEmissor, emissor.fornecedor_empresa_id)
        .catch(() => chavePrincipal ? spedy.listarCertificados(amb, chavePrincipal, emissor.fornecedor_empresa_id) : null)
      await admin.from('fiscal_emissores').update({
        certificado_validade: cert?.validade ?? null, certificado_titular: cert?.titular ?? null, certificado_conferido_em: new Date().toISOString(),
      }).eq('id', emissor.id)
      // Certificado de outro CNPJ? (o titular vem como "NOME:CNPJ")
      const outroCnpj = cert?.titular && !cert.titular.replace(/\D/g, '').includes(String(emissor.cnpj).replace(/\D/g, ''))
      return resp({ validade: cert?.validade ?? null, titular: cert?.titular ?? null, aviso: outroCnpj ? 'Atenção: o certificado não parece ser do CNPJ desta loja.' : null })
    }

    if (p.acao === 'inutilizar' || p.acao === 'consultar_inutilizacao') {
      const { data: pode } = await comoUsuario.rpc('pode_acao', { acao: 'estornar' })
      if (pode !== true) return erro('Sem permissão para inutilizar numeração. Peça ao gerente.', 403)
      if (p.acao === 'consultar_inutilizacao') {
        const { data: inu } = await admin.from('fiscal_inutilizacoes').select('id, emissor_id, ambiente, fornecedor_id')
          .eq('id', p.inutilizacao_id).eq('store_id', loja).maybeSingle()
        if (!inu?.fornecedor_id || !inu.emissor_id) return erro('Inutilização não encontrada.', 404)
        const r = await spedy.consultarInutilizacaoNfce(inu.ambiente as Ambiente, await chaveDoEmissor(inu.emissor_id), inu.fornecedor_id)
        if (r) await admin.from('fiscal_inutilizacoes').update({ status: r.status, protocolo: r.protocolo, retorno: r.motivo, updated_at: new Date().toISOString() }).eq('id', inu.id)
        return resp({ inutilizacao_id: inu.id, status: r?.status ?? 'processando', motivo: r?.motivo ?? null })
      }
      const serie = Number(p.serie), de = Number(p.de), ate = Number(p.ate ?? p.de)
      const motivo = String(p.motivo ?? '').trim()
      if (!(serie >= 0) || !(de > 0) || !(ate >= de)) return erro('Informe a série e os números (de / até).')
      if (ate - de > 999) return erro('No máximo 1000 números por vez.')
      if (motivo.length < 15) return erro('Explique o motivo (mínimo 15 letras).')
      const { data: emissor } = await admin.from('fiscal_emissores').select('id')
        .eq('store_id', loja).eq('papel', 'vendas').eq('ambiente', amb).eq('ativo', true).maybeSingle()
      if (!emissor) return erro('Nenhum CNPJ de vendas configurado nesta loja.')
      // Nunca inutilizar número que já virou nota válida
      const { data: usados } = await admin.from('notas_fiscais').select('numero')
        .eq('emissor_id', emissor.id).eq('modelo', 'nfce').eq('serie', String(serie)).gte('numero', de).lte('numero', ate)
        .in('status', ['autorizada', 'cancelada', 'denegada', 'processando', 'contingencia'])
      if (usados?.length) return erro(`O número ${usados.map((u) => u.numero).join(', ')} já é de uma nota válida e não pode ser inutilizado.`)
      const { data: reg, error } = await admin.from('fiscal_inutilizacoes').insert({
        store_id: loja, emissor_id: emissor.id, modelo: 'nfce', ambiente: amb, serie: String(serie),
        numero_de: de, numero_ate: ate, motivo, created_by: u.user.id,
      }).select('id').single()
      if (error) return erro(error.message)
      try {
        const r = await spedy.inutilizarNfce(amb, await chaveDoEmissor(emissor.id), serie, de, ate, motivo)
        await admin.from('fiscal_inutilizacoes').update({ status: r.status, fornecedor_id: r.idFornecedor, protocolo: r.protocolo, retorno: r.motivo, updated_at: new Date().toISOString() }).eq('id', reg.id)
        if (r.status === 'inutilizada') {
          await admin.from('notas_fiscais').update({ status: 'inutilizada', updated_at: new Date().toISOString() })
            .eq('emissor_id', emissor.id).eq('modelo', 'nfce').eq('serie', String(serie)).gte('numero', de).lte('numero', ate).in('status', ['rejeitada', 'erro'])
        }
        return resp({ inutilizacao_id: reg.id, ...r })
      } catch (e) {
        await admin.from('fiscal_inutilizacoes').update({ status: 'rejeitada', retorno: String((e as Error).message).slice(0, 500) }).eq('id', reg.id)
        return erro((e as Error).message, 502)
      }
    }

    // ---------------------------------------------------------------- consultar / cancelar uma nota da loja
    const { data: nota } = await admin.from('notas_fiscais').select('id, modelo, emissor_id, fornecedor_nota_id, status, ambiente')
      .eq('id', p.nota_id).eq('store_id', loja).maybeSingle()
    if (!nota) return erro('Nota não encontrada.', 404)
    if (!nota.fornecedor_nota_id || !nota.emissor_id) return erro('Essa nota não chegou a ser enviada.')
    if (nota.modelo !== 'nfce' && nota.modelo !== 'nfe') return erro('Tipo de nota ainda não suportado.')
    const ehNfe = nota.modelo === 'nfe'
    const chave = await chaveDoEmissor(nota.emissor_id)

    if (p.acao === 'atualizar') {
      const r = await (ehNfe ? spedy.consultarNfe : spedy.consultarNfce)(nota.ambiente as Ambiente, chave, nota.fornecedor_nota_id)
      await salvarRetorno(nota.id, r)
      return resp({ nota_id: nota.id, ...r })
    }

    if (p.acao === 'cancelar') {
      const { data: pode } = await comoUsuario.rpc('pode_acao', { acao: 'estornar' })
      if (pode !== true) return erro('Sem permissão para cancelar nota. Peça ao gerente.', 403)
      const motivo = String(p.motivo ?? '').trim()
      if (motivo.length < 15) return erro('Explique o motivo do cancelamento (mínimo 15 letras).')
      if (nota.status !== 'autorizada') return erro('Só dá para cancelar nota autorizada.')
      await (ehNfe ? spedy.cancelarNfe : spedy.cancelarNfce)(nota.ambiente as Ambiente, chave, nota.fornecedor_nota_id, motivo)
      const r = await (ehNfe ? spedy.consultarNfe : spedy.consultarNfce)(nota.ambiente as Ambiente, chave, nota.fornecedor_nota_id).catch(() => null)
      await admin.from('notas_fiscais').update({
        // Spedy cancela em segundo plano: até a SEFAZ confirmar, fica "processando" (o botão Consultar aparece)
        status: r?.status === 'cancelada' ? 'cancelada' : 'processando',
        cancel_motivo: motivo, cancelada_em: r?.status === 'cancelada' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }).eq('id', nota.id)
      return resp({ nota_id: nota.id, status: r?.status ?? 'processando' })
    }

    // Carta de correção (CC-e): só NF-e autorizada; não corrige valor, imposto, item, emitente nem destinatário
    if (p.acao === 'corrigir') {
      if (!ehNfe) return erro('Carta de correção só existe para NF-e. NFC-e errada tem que ser cancelada.')
      if (nota.status !== 'autorizada') return erro('Só dá para corrigir NF-e autorizada.')
      const { data: podeVender } = await comoUsuario.rpc('pode_acao', { acao: 'balcao' })
      if (podeVender !== true) return erro('Sem permissão de Balcão.', 403)
      const texto = String(p.texto ?? '').replace(/\s+/g, ' ').trim()
      if (texto.length < 15 || texto.length > 1000) return erro('A correção precisa ter de 15 a 1000 letras.')
      const ret = await spedy.corrigirNfe(nota.ambiente as Ambiente, chave, nota.fornecedor_nota_id, texto)
      const protocolo = String((ret as { protocol?: string })?.protocol ?? '') || null
      const { data: atual } = await admin.from('notas_fiscais').select('cce_quantidade').eq('id', nota.id).single()
      await admin.from('notas_fiscais').update({
        cce_quantidade: Number(atual?.cce_quantidade ?? 0) + 1, cce_ultima: texto, cce_protocolo: protocolo,
        cce_em: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq('id', nota.id)
      return resp({ nota_id: nota.id, ok: true, protocolo })
    }

    return erro('Ação desconhecida')
  } catch (e) {
    console.error('fiscal:', e)
    return erro(String((e as Error).message ?? e), 500)
  }
})
