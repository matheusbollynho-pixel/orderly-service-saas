// Notas fiscais: emitir / atualizar / cancelar NFC-e (balcão). Só o servidor tem as chaves do fornecedor.
// Ações (POST JSON):
//   { acao: 'emitir_nfce', balcao_order_id, cpf? }
//   { acao: 'atualizar', nota_id }
//   { acao: 'cancelar', nota_id, motivo }   (mín. 15 caracteres; quem pode estornar)
// A loja é sempre a do usuário logado; módulo fiscal precisa estar ligado na loja.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { agoraBrasilia, montarNfce, spedy, type Ambiente, type RetornoNota } from '../_shared/fiscal/spedy.ts'

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
  await admin.from('notas_fiscais').update({
    fornecedor_nota_id: r.idFornecedor, status: r.status, numero: r.numero, serie: r.serie, chave: r.chave,
    protocolo: r.protocolo, autorizada_em: r.autorizadaEm, motivo: r.motivo, updated_at: new Date().toISOString(),
  }).eq('id', notaId)
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
    const { data: loja } = await comoUsuario.rpc('get_my_store_id')
    if (!loja) return erro('Usuário sem loja', 403)

    const p = await req.json().catch(() => null) as Record<string, string> | null
    if (!p?.acao) return erro('Ação não informada')

    const { data: cfg } = await admin.from('store_settings')
      .select('fiscal_ativo, fiscal_ambiente, fiscal_ncm_padrao, fiscal_cfop_padrao, fiscal_csosn_padrao, fiscal_origem_padrao, fiscal_regime, fiscal_icms_aliquota, fiscal_pis_cofins_cst, fiscal_pis_aliquota, fiscal_cofins_aliquota, fiscal_fcp_aliquota')
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

    // ---------------------------------------------------------------- emitir NFC-e de uma venda do balcão
    if (p.acao === 'emitir_nfce') {
      const { data: podeVender } = await comoUsuario.rpc('pode_acao', { acao: 'balcao' })
      if (podeVender !== true) return erro('Sem permissão de Balcão para emitir nota.', 403)
      const { data: emissor } = await admin.from('fiscal_emissores').select('id')
        .eq('store_id', loja).eq('papel', 'vendas').eq('ambiente', amb).eq('ativo', true).maybeSingle()
      if (!emissor) return erro('Nenhum CNPJ de vendas configurado para emitir nota nesta loja.')
      const { data: venda } = await admin.from('balcao_orders')
        .select('id, store_id, status, discount_amount, payment_method, payment_methods, client_cpf, venda_online, balcao_items(description, quantity, unit_price, product_id)')
        .eq('id', p.balcao_order_id).eq('store_id', loja).single()
      if (!venda) return erro('Venda não encontrada.', 404)
      if (venda.status !== 'finalizada') return erro('Só dá para emitir nota de venda finalizada.')

      // Já tem nota viva desta venda? Reaproveita a rejeitada (corrige com o mesmo id).
      const { data: anteriores } = await admin.from('notas_fiscais').select('id, status')
        .eq('balcao_order_id', venda.id).eq('modelo', 'nfce').order('created_at', { ascending: false })
      const viva = (anteriores ?? []).find((n) => !['rejeitada', 'denegada', 'cancelada', 'erro', 'inutilizada'].includes(n.status))
      if (viva) return erro(viva.status === 'autorizada' ? 'Esta venda já tem nota autorizada.' : 'Esta venda já tem nota em processamento.')
      // Tentativa que deu ERRO no envio (Spedy pode ou não ter recebido): reenvia com o MESMO id, sem risco de nota duplicada.
      // Nota REJEITADA pela SEFAZ não é reaproveitada: a Spedy mantém o horário antigo e a SEFAZ recusa NFC-e atrasada (704).
      // Então vira nota nova (próximo número); o número da rejeitada fica para inutilizar.
      const rejeitada = (anteriores ?? []).find((n) => n.status === 'erro')

      const ids = [...new Set((venda.balcao_items ?? []).map((i: { product_id: string | null }) => i.product_id).filter(Boolean))]
      const { data: prods } = ids.length
        ? await admin.from('inventory_products').select('id, code, barcode, unit, ncm, cest, cfop, csosn, origem_fiscal, pis_cofins_cst').in('id', ids)
        : { data: [] }
      const porId = new Map((prods ?? []).map((x: Record<string, unknown>) => [x.id as string, x]))
      const itens = (venda.balcao_items ?? []).map((i: { description: string; quantity: number; unit_price: number; product_id: string | null }) => {
        const pr = (i.product_id ? porId.get(i.product_id) : null) as Record<string, unknown> | null
        return {
          codigo: String(pr?.code ?? ''), descricao: i.description, quantidade: Number(i.quantity), valorUnitario: Number(i.unit_price),
          unidade: String(pr?.unit ?? 'UN'), ncm: (pr?.ncm as string) ?? null, cfop: (pr?.cfop as string) ?? null,
          csosn: (pr?.csosn as string) ?? null, origem: pr?.origem_fiscal != null ? Number(pr.origem_fiscal) : null,
          gtin: (pr?.barcode as string) ?? null, cest: (pr?.cest as string) ?? null,
          pisCofinsCst: pr?.pis_cofins_cst != null ? Number(pr.pis_cofins_cst) : null,
        }
      })
      const formas = Array.isArray(venda.payment_methods) && venda.payment_methods.length
        ? venda.payment_methods.map((x: { method: string; amount: number }) => ({ forma: x.method, valor: Number(x.amount) || 0 }))
        : [{ forma: venda.payment_method ?? 'dinheiro', valor: 0 }]

      // Registro antes de enviar (o id dele é o identificador no fornecedor = sem nota duplicada)
      let notaId = rejeitada?.id as string | undefined
      if (!notaId) {
        const { data: nova, error } = await admin.from('notas_fiscais').insert({
          store_id: loja, emissor_id: emissor.id, modelo: 'nfce', origem: venda.venda_online ? 'site' : 'balcao',
          balcao_order_id: venda.id, ambiente: amb, status: 'processando', created_by: u.user.id,
          cpf_cnpj_cliente: (p.cpf || venda.client_cpf || '').replace(/\D/g, '') || null,
        }).select('id').single()
        if (error) return erro(error.code === '23505' ? 'Esta venda já tem nota em processamento.' : error.message)
        notaId = nova.id
      } else {
        await admin.from('notas_fiscais').update({
          status: 'processando', motivo: null, updated_at: new Date().toISOString(),
          cpf_cnpj_cliente: (p.cpf || venda.client_cpf || '').replace(/\D/g, '') || null,
        }).eq('id', notaId)
      }

      let corpo
      try {
        corpo = montarNfce({
          idIntegracao: notaId!, itens, desconto: Number(venda.discount_amount) || 0, pagamentos: formas,
          cpf: p.cpf || venda.client_cpf, online: !!venda.venda_online, emitidaEm: agoraBrasilia(),
        }, {
          ncm: cfg.fiscal_ncm_padrao, cfop: cfg.fiscal_cfop_padrao, csosn: cfg.fiscal_csosn_padrao,
          origem: cfg.fiscal_origem_padrao, pisCofinsCst: 49,
          regime: cfg.fiscal_regime === 'normal' ? 'normal' : 'simples',
          icmsAliquota: cfg.fiscal_icms_aliquota != null ? Number(cfg.fiscal_icms_aliquota) : null,
          pisCofinsCstNormal: Number(cfg.fiscal_pis_cofins_cst ?? 1),
          pisAliquota: Number(cfg.fiscal_pis_aliquota ?? 0.65),
          cofinsAliquota: Number(cfg.fiscal_cofins_aliquota ?? 3),
          fcpAliquota: cfg.fiscal_fcp_aliquota != null ? Number(cfg.fiscal_fcp_aliquota) : null,
        })
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

    // ---------------------------------------------------------------- inutilizar números pulados (NFC-e)
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
    if (nota.modelo !== 'nfce') return erro('Tipo de nota ainda não suportado.')
    const chave = await chaveDoEmissor(nota.emissor_id)

    if (p.acao === 'atualizar') {
      const r = await spedy.consultarNfce(nota.ambiente as Ambiente, chave, nota.fornecedor_nota_id)
      await salvarRetorno(nota.id, r)
      return resp({ nota_id: nota.id, ...r })
    }

    if (p.acao === 'cancelar') {
      const { data: pode } = await comoUsuario.rpc('pode_acao', { acao: 'estornar' })
      if (pode !== true) return erro('Sem permissão para cancelar nota. Peça ao gerente.', 403)
      const motivo = String(p.motivo ?? '').trim()
      if (motivo.length < 15) return erro('Explique o motivo do cancelamento (mínimo 15 letras).')
      if (nota.status !== 'autorizada') return erro('Só dá para cancelar nota autorizada.')
      await spedy.cancelarNfce(nota.ambiente as Ambiente, chave, nota.fornecedor_nota_id, motivo)
      const r = await spedy.consultarNfce(nota.ambiente as Ambiente, chave, nota.fornecedor_nota_id).catch(() => null)
      await admin.from('notas_fiscais').update({
        status: r?.status === 'cancelada' ? 'cancelada' : (r?.status ?? 'processando'),
        cancel_motivo: motivo, cancelada_em: r?.status === 'cancelada' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }).eq('id', nota.id)
      return resp({ nota_id: nota.id, status: r?.status ?? 'processando' })
    }

    return erro('Ação desconhecida')
  } catch (e) {
    console.error('fiscal:', e)
    return erro(String((e as Error).message ?? e), 500)
  }
})
