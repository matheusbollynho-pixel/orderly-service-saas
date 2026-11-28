// Tradutor do fornecedor fiscal SPEDY. Tudo que é específico da Spedy fica aqui;
// trocar de fornecedor = escrever outro arquivo com as mesmas funções.
// Sem nada de Deno (só fetch), para dar para testar no vitest.

export type Ambiente = 'sandbox' | 'producao'
export type StatusNota = 'processando' | 'autorizada' | 'rejeitada' | 'denegada' | 'cancelada' | 'contingencia' | 'erro'

export const baseUrl = (amb: Ambiente) => (amb === 'producao' ? 'https://api.spedy.com.br/v1' : 'https://sandbox-api.spedy.com.br/v1')

export function statusSpedy(s: string | null | undefined): StatusNota {
  switch (s) {
    case 'authorized': return 'autorizada'
    case 'rejected': return 'rejeitada'
    case 'denied': return 'denegada'
    case 'canceled': return 'cancelada'
    case 'inContingent': return 'contingencia'
    case 'removed': case 'disabled': return 'erro'
    default: return 'processando' // created, enqueued, received
  }
}

// --------------------------------------------------------------- montagem da NFC-e

export interface ItemVenda {
  codigo: string
  descricao: string
  quantidade: number
  valorUnitario: number
  unidade: string
  ncm: string | null
  cfop: string | null
  csosn: string | null
  origem: number | null
  gtin?: string | null
  cest?: string | null
  /** Regime normal: CST de PIS/COFINS do produto (vazio = padrão da loja) */
  pisCofinsCst?: number | null
}
export interface PagamentoVenda { forma: string; valor: number }
export type Regime = 'simples' | 'normal'
export interface PadroesFiscais {
  ncm: string | null
  cfop: string
  csosn: string
  origem: number
  /** CST de PIS/COFINS no Simples (49 = outras saídas) */
  pisCofinsCst: number
  /** Simples Nacional (CSOSN) ou regime normal - Lucro Presumido/Real (CST + alíquotas). Padrão: simples */
  regime?: Regime
  /** Regime normal: alíquota interna de ICMS da UF, em % (ex.: 20.5 na BA) */
  icmsAliquota?: number | null
  /** Regime normal: CST de PIS/COFINS (1 = tributável, 4 = monofásico revenda, 6 = alíquota zero...) e alíquotas em % */
  pisCofinsCstNormal?: number
  pisAliquota?: number
  cofinsAliquota?: number
  /** Regime normal: FCP (Fundo de Combate à Pobreza) em %, destacado à parte do ICMS (ex.: BA 2,5) */
  fcpAliquota?: number | null
}

/** Item com ICMS já recolhido por substituição tributária (ST)? Vale para os dois regimes. */
export const itemComSt = (csosn: string | null, cfop: string | null) =>
  ['500', '201', '202', '203', '60', '10', '70'].includes(String(csosn ?? '').replace(/\D/g, '')) || String(cfop ?? '').replace(/\D/g, '') === '5405'
const CST_PIS_COM_VALOR = [1, 2]
export interface VendaNfce {
  idIntegracao: string
  itens: ItemVenda[]
  desconto: number
  pagamentos: PagamentoVenda[]
  cpf?: string | null
  online?: boolean
  /** Data/hora da emissão no horário de Brasília (AAAA-MM-DDTHH:MM:SS). Sempre a de AGORA: a SEFAZ recusa NFC-e atrasada (704). */
  emitidaEm?: string
  /** CPF/CNPJ autorizados a baixar o XML na SEFAZ (grupo autXML): o escritório de contabilidade */
  autorizadosXml?: string[]
}

/** CNPJ da SEFAZ-BA: a Bahia exige o grupo autXML na NF-e; sem contador, informa este (rejeição 486). */
export const CNPJ_SEFAZ_BA = '13937073000156'
/** Quem pode baixar o XML: o contador da loja; na Bahia sem contador, a própria SEFAZ-BA. */
export function autorizadosXml(contadorDoc: string | null | undefined, ufEmitente: string | null | undefined): string[] {
  const d = String(contadorDoc ?? '').replace(/\D/g, '')
  if (d.length === 11 || d.length === 14) return [d]
  return String(ufEmitente ?? '').toUpperCase() === 'BA' ? [CNPJ_SEFAZ_BA] : []
}

/** Agora no horário de Brasília, no formato que a Spedy espera (sem fuso). */
export function agoraBrasilia(d = new Date()): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).map((x) => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`
}

const r2 = (v: number) => Math.round(v * 100) / 100

/** Forma de pagamento do app → enum da Spedy */
export function formaSpedy(forma: string): string {
  const f = (forma || '').toLowerCase()
  if (f === 'dinheiro') return 'money'
  if (f === 'pix') return 'pix'
  if (f === 'cartao_debito' || f === 'debito') return 'debitCard'
  if (f.startsWith('cartao') || f === 'credito') return 'creditCard'
  if (f === 'fiado') return 'storeCredit'
  if (f === 'boleto') return 'billetBanking'
  if (f === 'transferencia') return 'bankTransfer'
  return 'other'
}

/** Monta o corpo do POST /v1/consumer-invoices. Lança erro com mensagem clara se faltar dado fiscal. */
/** Ajustes usados pela NF-e (venda para outro estado): CFOP 6xxx e alíquota interestadual por item. */
export interface AjustesNota {
  cfop?: (cfop: number, comSt: boolean) => number
  icmsRate?: (it: ItemVenda) => number
}

export function montarNfce(v: VendaNfce, pad: PadroesFiscais, aj: AjustesNota = {}) {
  if (!v.itens.length) throw new Error('A venda não tem itens.')
  const faltando: string[] = []
  const itens = v.itens.map((it) => {
    const ncm = (it.ncm || pad.ncm || '').replace(/\D/g, '')
    if (ncm.length !== 8) faltando.push(it.descricao)
    const total = r2(it.quantidade * it.valorUnitario)
    return { it, ncm, total }
  })
  if (faltando.length) {
    throw new Error(`Sem NCM (código fiscal do produto): ${faltando.join(', ')}. Cadastre o NCM no produto ou um NCM padrão nas configurações fiscais.`)
  }
  const normal = pad.regime === 'normal'
  if (normal && !aj.icmsRate && itens.some((x) => !itemComSt(x.it.csosn, x.it.cfop)) && !(Number(pad.icmsAliquota) > 0)) {
    throw new Error('Configure a alíquota de ICMS da loja (configurações fiscais) para emitir no regime normal.')
  }
  const fcp = Number(pad.fcpAliquota) || 0
  let somaBaseIcms = 0, somaIcms = 0, somaFcp = 0, somaPis = 0, somaCofins = 0
  const bruto = r2(itens.reduce((s, x) => s + x.total, 0))
  const desconto = Math.min(r2(v.desconto || 0), bruto)
  // Impostos do item conforme o regime da loja (valor líquido = já com a parte do desconto)
  const impostos = (it: ItemVenda, liquido: number) => {
    const origin = it.origem ?? pad.origem
    if (!normal) {
      return {
        icms: { origin, csosn: Number((it.csosn || pad.csosn).replace(/\D/g, '')) },
        pis: { cst: pad.pisCofinsCst },
        cofins: { cst: pad.pisCofinsCst },
      }
    }
    let icms: Record<string, number>
    if (itemComSt(it.csosn, it.cfop)) {
      icms = { origin, cst: 60 }
    } else {
      const rate = aj.icmsRate ? aj.icmsRate(it) : Number(pad.icmsAliquota)
      const amount = r2(liquido * rate / 100)
      somaBaseIcms = r2(somaBaseIcms + liquido); somaIcms = r2(somaIcms + amount)
      icms = { origin, cst: 0, baseTaxModality: 3, baseTax: liquido, baseTaxReduction: 0, rate, amount }
      if (fcp > 0) {
        const vFcp = r2(liquido * fcp / 100)
        somaFcp = r2(somaFcp + vFcp)
        icms = { ...icms, fcpRate: fcp, fcpAmount: vFcp }
      }
    }
    const cstPis = it.pisCofinsCst ?? pad.pisCofinsCstNormal ?? 1
    const pisCofins = (aliq: number | undefined, soma: (v: number) => void) => {
      if (!CST_PIS_COM_VALOR.includes(cstPis)) return { cst: cstPis }
      const rate = Number(aliq) || 0
      const amount = r2(liquido * rate / 100)
      soma(amount)
      return { cst: cstPis, baseTax: liquido, rate, amount }
    }
    return {
      icms,
      pis: pisCofins(pad.pisAliquota ?? 0.65, (v) => { somaPis = r2(somaPis + v) }),
      cofins: pisCofins(pad.cofinsAliquota ?? 3, (v) => { somaCofins = r2(somaCofins + v) }),
    }
  }
  // Desconto da venda dividido entre os itens pelo peso de cada um (o último fecha a conta)
  let resto = desconto
  const corpoItens = itens.map((x, i) => {
    const d = i === itens.length - 1 ? r2(resto) : r2(bruto > 0 ? desconto * (x.total / bruto) : 0)
    resto = r2(resto - d)
    const liquido = r2(x.total - d)
    const unidade = (x.it.unidade || 'UN').toUpperCase().slice(0, 6)
    const gtin = x.it.gtin && /^\d{8,14}$/.test(x.it.gtin) ? x.it.gtin : undefined
    return {
      code: (x.it.codigo || '').slice(0, 60) || 'ITEM',
      ...(gtin ? { gtinCode: gtin } : {}),
      description: x.it.descricao.slice(0, 120),
      ncm: x.ncm,
      ...(x.it.cest ? { cest: x.it.cest } : {}),
      cfop: (() => {
        const st = itemComSt(x.it.csosn, x.it.cfop)
        const base = Number((x.it.cfop || (itemComSt(x.it.csosn, null) ? '5405' : pad.cfop)).replace(/\D/g, ''))
        return aj.cfop ? aj.cfop(base, st) : base
      })(),
      unit: unidade,
      quantity: x.it.quantidade,
      unitAmount: r2(x.it.valorUnitario),
      totalAmount: x.total,
      unitTax: unidade,
      quantityTax: x.it.quantidade,
      unitTaxAmount: r2(x.it.valorUnitario),
      ...(d > 0 ? { discountAmount: d } : {}),
      makeupTotal: true,
      taxes: impostos(x.it, liquido),
    }
  })
  const totalNota = r2(bruto - desconto)
  // Pagamentos: se não fecham com o total, vai tudo na forma principal
  const pags = v.pagamentos.filter((p) => p.valor > 0)
  const soma = r2(pags.reduce((s, p) => s + p.valor, 0))
  const payments = pags.length && Math.abs(soma - totalNota) < 0.01
    ? pags.map((p) => ({ method: formaSpedy(p.forma), amount: r2(p.valor) }))
    : [{ method: formaSpedy(pags[0]?.forma ?? 'dinheiro'), amount: totalNota }]
  const cpf = (v.cpf || '').replace(/\D/g, '')
  return {
    integrationId: v.idIntegracao,
    ...(v.emitidaEm ? { issuedOn: v.emitidaEm } : {}),
    isFinalCustomer: true,
    operationType: 'outgoing',
    destination: 'internal',
    presenceType: v.online ? 'internet' : 'presence',
    operationNature: 'Venda de Mercadoria',
    sendEmailToCustomer: false,
    ...(v.autorizadosXml?.length ? { authorizedPersons: v.autorizadosXml.slice(0, 10) } : {}),
    ...(cpf.length === 11 || cpf.length === 14 ? { receiver: { federalTaxNumber: cpf } } : {}),
    items: corpoItens,
    payments,
    total: {
      invoiceAmount: totalNota, productAmount: bruto, ...(desconto > 0 ? { discountAmount: desconto } : {}),
      ...(normal ? { icmsBaseTax: somaBaseIcms, icmsAmount: somaIcms, ...(somaFcp > 0 ? { fcpAmount: somaFcp } : {}), pisAmount: somaPis, cofinsAmount: somaCofins } : {}),
    },
  }
}

// --------------------------------------------------------------- NF-e (modelo 55, cliente com CNPJ)

export interface Destinatario {
  documento: string            // CNPJ (14) ou CPF (11)
  nome: string                 // razão social
  ie?: string | null           // números ou 'ISENTO'
  ieIndicador?: 'contribuinte' | 'isento' | 'nao_contribuinte' | null
  email?: string | null
  telefone?: string | null
  logradouro: string
  numero: string
  complemento?: string | null
  bairro: string
  cep: string
  cidade: string
  uf: string
  cidadeIbge: string
}
export interface VendaNfe extends VendaNfce {
  destinatario: Destinatario
  /** UF de quem emite (ex.: 'BA') — decide se é venda interna ou para outro estado */
  ufEmitente: string
  /** Cliente vai revender/usar na produção? (lojista com IE = sim). Padrão: contribuinte com IE não é consumidor final */
  consumidorFinal?: boolean
  observacao?: string | null
}

const IND_IE = { contribuinte: 'taxPayer', isento: 'exempt', nao_contribuinte: 'nonTaxPayer' } as const
// Regiões que recebem 7% quando a venda sai do Sul/Sudeste (exceto ES): Norte, Nordeste, Centro-Oeste e ES
const UF_SUL_SUDESTE = ['SP', 'RJ', 'MG', 'PR', 'SC', 'RS']
const ORIGEM_IMPORTADA = [1, 2, 3, 8]

/** CFOP de venda interna (5xxx) → interestadual (6xxx). 5405 (ST já retido) vira 6404. */
export function cfopInterestadual(cfop: number): number {
  if (cfop === 5405) return 6404
  const s = String(cfop)
  return s.startsWith('5') ? Number('6' + s.slice(1)) : cfop
}

/** Alíquota de ICMS em venda para outro estado: 4% importado; 7% do Sul/Sudeste para N/NE/CO/ES; senão 12%. */
export function aliquotaInterestadual(ufOrigem: string, ufDestino: string, origemProduto: number): number {
  if (ORIGEM_IMPORTADA.includes(origemProduto)) return 4
  const o = ufOrigem.toUpperCase(), d = ufDestino.toUpperCase()
  if (UF_SUL_SUDESTE.includes(o) && !UF_SUL_SUDESTE.includes(d)) return 7
  return 12
}

/** Monta o corpo do POST /v1/product-invoices. Lança erro claro se faltar dado do cliente. */
export function montarNfe(v: VendaNfe, pad: PadroesFiscais) {
  const d = v.destinatario
  const doc = (d.documento || '').replace(/\D/g, '')
  const faltam: string[] = []
  if (doc.length !== 14 && doc.length !== 11) faltam.push('CNPJ/CPF')
  if (!d.nome?.trim()) faltam.push('razão social')
  if (!d.logradouro?.trim()) faltam.push('rua')
  if (!d.bairro?.trim()) faltam.push('bairro')
  if ((d.cep || '').replace(/\D/g, '').length !== 8) faltam.push('CEP')
  if (!d.cidade?.trim()) faltam.push('cidade')
  if ((d.uf || '').trim().length !== 2) faltam.push('UF')
  if ((d.cidadeIbge || '').replace(/\D/g, '').length !== 7) faltam.push('código IBGE da cidade')
  if (faltam.length) throw new Error(`Faltam dados do cliente para a NF-e: ${faltam.join(', ')}. Use o "Buscar CNPJ" no cadastro do cliente.`)

  const ieNum = (d.ie || '').replace(/\D/g, '')
  const indicador = d.ieIndicador
    ?? (doc.length === 14 && ieNum ? 'contribuinte' : doc.length === 14 && /isento/i.test(d.ie || '') ? 'isento' : 'nao_contribuinte')
  if (indicador === 'contribuinte' && !ieNum) throw new Error('Cliente marcado como contribuinte de ICMS, mas sem Inscrição Estadual.')
  const ufE = (v.ufEmitente || '').toUpperCase(), ufD = d.uf.toUpperCase()
  if (ufE.length !== 2) throw new Error('UF da loja emitente não configurada.')
  const interestadual = ufE !== ufD
  const consumidorFinal = v.consumidorFinal ?? indicador !== 'contribuinte'
  // Venda para consumidor final não contribuinte em outro estado exige DIFAL (partilha do ICMS): ainda não feito
  if (interestadual && indicador === 'nao_contribuinte') {
    throw new Error('Venda para outro estado a não contribuinte (DIFAL) ainda não é emitida pelo sistema. Fale com o contador.')
  }

  const aj: AjustesNota = interestadual
    ? { cfop: (c) => cfopInterestadual(c), icmsRate: (it) => aliquotaInterestadual(ufE, ufD, it.origem ?? pad.origem) }
    : {}
  // FCP é de operação interna; em venda para outro estado não vai
  const base = montarNfce({ ...v, cpf: null, online: v.online }, interestadual ? { ...pad, fcpAliquota: null } : pad, aj)
  return {
    ...base,
    isFinalCustomer: consumidorFinal,
    destination: interestadual ? 'interstate' : 'internal',
    receiver: {
      name: d.nome.trim().slice(0, 60),
      federalTaxNumber: doc,
      stateTaxNumberIndicator: IND_IE[indicador],
      ...(indicador === 'contribuinte' ? { stateTaxNumber: ieNum } : indicador === 'isento' ? { stateTaxNumber: 'ISENTO' } : {}),
      ...(d.email ? { email: d.email.trim() } : {}),
      ...(d.telefone && d.telefone.replace(/\D/g, '').length >= 10 ? { phoneNumber: d.telefone.replace(/\D/g, '') } : {}),
      address: {
        street: d.logradouro.trim().slice(0, 60),
        number: (d.numero || 'S/N').trim().slice(0, 60),
        ...(d.complemento ? { additionalInformation: d.complemento.trim().slice(0, 60) } : {}),
        district: d.bairro.trim().slice(0, 60),
        postalCode: d.cep.replace(/\D/g, ''),
        city: { code: d.cidadeIbge.replace(/\D/g, ''), name: d.cidade.trim(), state: ufD },
      },
    },
    ...(v.observacao ? { additionalInformation: v.observacao.slice(0, 2000) } : {}),
  }
}

// --------------------------------------------------------------- chamadas

/** Erro da Spedy em português legível (ela devolve lista [{message, path}] ou {message}/{errors}). */
export function mensagemErro(status: number, dados: unknown): string {
  if (status === 401 || status === 403) return 'O fornecedor da nota recusou a chave deste CNPJ. Fale com o suporte.'
  const lista = Array.isArray(dados) ? dados
    : (dados as { errors?: unknown })?.errors && Array.isArray((dados as { errors: unknown[] }).errors) ? (dados as { errors: unknown[] }).errors
    : null
  let msg: string
  if (lista) {
    msg = lista.map((e) => {
      const x = e as { message?: string; path?: string | null } | string
      return typeof x === 'string' ? x : `${x.message ?? ''}${x.path ? ` (${x.path})` : ''}`
    }).filter(Boolean).join('; ')
  } else if (typeof dados === 'string') msg = dados
  else msg = (dados as { message?: string; title?: string })?.message || (dados as { title?: string })?.title || JSON.stringify(dados)
  if (status >= 500) return `O fornecedor da nota está fora do ar agora (${status}). Tente de novo em alguns minutos.`
  return `Nota recusada: ${String(msg || 'erro ' + status).slice(0, 500)}`
}

async function chamar(amb: Ambiente, chave: string, metodo: string, caminho: string, corpo?: unknown) {
  const r = await fetch(`${baseUrl(amb)}${caminho}`, {
    method: metodo,
    headers: { 'X-Api-Key': chave, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: corpo ? JSON.stringify(corpo) : undefined,
  })
  const texto = await r.text()
  let dados: unknown = null
  try { dados = texto ? JSON.parse(texto) : null } catch { dados = texto }
  if (!r.ok) throw new Error(mensagemErro(r.status, dados))
  return dados as Record<string, unknown>
}

export interface RetornoNota {
  idFornecedor: string
  status: StatusNota
  numero: number | null
  serie: string | null
  chave: string | null
  protocolo: string | null
  autorizadaEm: string | null
  motivo: string | null
}

/** A Spedy manda o horário de Brasília sem fuso ("2026-11-26T09:18:13"). Sem o fuso, o banco grava como UTC
 *  e a nota aparece 3 horas antes. Data que já tem fuso (Z ou ±hh:mm) fica como veio. */
export function dataBrasilia(s: string | null | undefined): string | null {
  if (!s) return null
  return /(Z|[+-]\d{2}:?\d{2})$/i.test(s.trim()) ? s.trim() : `${s.trim()}-03:00`
}

function lerNota(d: Record<string, unknown>): RetornoNota {
  const auth = (d.authorization ?? {}) as { date?: string; protocol?: string }
  const det = (d.processingDetail ?? {}) as { message?: string; code?: string; status?: string }
  const status = statusSpedy(d.status as string)
  return {
    idFornecedor: String(d.id),
    status,
    numero: Number(d.number) > 0 ? Number(d.number) : null,
    serie: d.series != null ? String(d.series) : null,
    chave: (d.accessKey as string) || null,
    protocolo: auth.protocol || null,
    autorizadaEm: status === 'autorizada' ? dataBrasilia(auth.date) : null,
    motivo: motivoNota(status, det),
  }
}

/** Motivo para mostrar: recusa da nota; ou, em nota autorizada, um pedido que falhou depois (ex.: cancelamento recusado). */
export function motivoNota(status: StatusNota, det: { message?: string; code?: string; status?: string }): string | null {
  const texto = det.message ? `${det.code ? det.code + ' - ' : ''}${det.message}` : null
  if (['rejeitada', 'denegada', 'erro'].includes(status)) return texto
  if (status === 'autorizada' && det.status === 'failed' && texto) return `Último pedido recusado pela SEFAZ (a nota continua valendo): ${texto}`
  return null
}

export interface RetornoInutilizacao { idFornecedor: string | null; status: 'processando' | 'inutilizada' | 'rejeitada'; protocolo: string | null; motivo: string | null }

/** Lê a resposta da inutilização (formato não documentado pela Spedy: leitura tolerante). */
export function lerInutilizacao(d: Record<string, unknown> | null): RetornoInutilizacao {
  const st = String(d?.status ?? '').toLowerCase()
  // Formato real (sandbox 25/11): { id, status, protocolNumber, messageCode, messageText }
  const det = (d?.processingDetail ?? {}) as { message?: string; code?: string }
  const codigo = String(d?.messageCode ?? det.code ?? '')
  const texto = String(d?.messageText ?? det.message ?? '').replace(/\s+/g, ' ').trim()
  const status = ['disabled', 'authorized', 'success', 'homologated'].includes(st) || codigo === '102' ? 'inutilizada'
    : ['rejected', 'denied', 'error', 'failed'].includes(st) ? 'rejeitada' : 'processando'
  return {
    idFornecedor: d?.id != null ? String(d.id) : null,
    status,
    protocolo: (d?.protocolNumber as string) || ((d?.authorization as { protocol?: string })?.protocol) || null,
    motivo: texto ? `${codigo ? codigo + ' - ' : ''}${texto}` : null,
  }
}

export interface CertificadoInfo { validade: string | null; titular: string | null; ativo: boolean }

/** Certificado ativo (o de validade mais longa) da lista da Spedy */
export function certificadoAtivo(lista: unknown): CertificadoInfo | null {
  const itens = (Array.isArray(lista) ? lista : []) as { expirationAt?: string; subject?: string; isActive?: boolean }[]
  const ativos = itens.filter((c) => c.isActive !== false).sort((a, b) => String(b.expirationAt).localeCompare(String(a.expirationAt)))
  const c = ativos[0] ?? itens[0]
  return c ? { validade: c.expirationAt ?? null, titular: c.subject ?? null, ativo: c.isActive !== false } : null
}

/** Envia o certificado A1 (multipart). O arquivo e a senha só passam pela memória, nada é guardado. */
async function enviarCertificado(amb: Ambiente, chave: string, empresaId: string, arquivo: Uint8Array, nome: string, senha: string) {
  const form = new FormData()
  form.append('certificateFile', new Blob([new Uint8Array(arquivo)], { type: 'application/x-pkcs12' }), nome)
  form.append('password', senha)
  const r = await fetch(`${baseUrl(amb)}/companies/${empresaId}/certificates`, { method: 'POST', headers: { 'X-Api-Key': chave, Accept: 'application/json' }, body: form })
  const texto = await r.text()
  if (!r.ok) {
    let dados: unknown = texto
    try { dados = JSON.parse(texto) } catch { /* texto puro */ }
    const msg = mensagemErro(r.status, dados).replace(/^Nota recusada: /, '')
    const e = new Error(r.status === 401 || r.status === 403 ? msg : `Certificado recusado: ${msg}`) as Error & { status?: number }
    e.status = r.status
    throw e
  }
}

export const spedy = {
  emitirNfce: async (amb: Ambiente, chave: string, corpo: unknown) => lerNota(await chamar(amb, chave, 'POST', '/consumer-invoices', corpo)),
  consultarNfce: async (amb: Ambiente, chave: string, id: string) => lerNota(await chamar(amb, chave, 'GET', `/consumer-invoices/${id}`)),
  cancelarNfce: async (amb: Ambiente, chave: string, id: string, motivo: string) => {
    await chamar(amb, chave, 'DELETE', `/consumer-invoices/${id}`, { reason: motivo })
  },
  inutilizarNfce: async (amb: Ambiente, chave: string, serie: number, de: number, ate: number, motivo: string) =>
    lerInutilizacao(await chamar(amb, chave, 'POST', '/consumer-invoices/disablements', { series: serie, initialNumber: de, finalNumber: ate, reason: motivo })),
  /** Procura a inutilização na lista (não há GET por id documentado) */
  consultarInutilizacaoNfce: async (amb: Ambiente, chave: string, id: string) => {
    const lista = await chamar(amb, chave, 'GET', '/consumer-invoices/disablements?page=1&pageSize=50')
    const item = ((lista.items ?? []) as Record<string, unknown>[]).find((x) => String(x.id) === id) ?? null
    return item ? lerInutilizacao(item) : null
  },
  enviarCertificado,
  listarCertificados: async (amb: Ambiente, chave: string, empresaId: string) =>
    certificadoAtivo(await chamar(amb, chave, 'GET', `/companies/${empresaId}/certificates`)),
  /** UF da empresa emitente cadastrada na Spedy (ex.: 'BA') */
  ufDaEmpresa: async (amb: Ambiente, chave: string, empresaId: string) => {
    const e = await chamar(amb, chave, 'GET', `/companies/${empresaId}`)
    return String(((e.address as { city?: { state?: string } })?.city?.state) ?? '').toUpperCase()
  },
  emitirNfe: async (amb: Ambiente, chave: string, corpo: unknown) => lerNota(await chamar(amb, chave, 'POST', '/product-invoices', corpo)),
  consultarNfe: async (amb: Ambiente, chave: string, id: string) => lerNota(await chamar(amb, chave, 'GET', `/product-invoices/${id}`)),
  cancelarNfe: async (amb: Ambiente, chave: string, id: string, motivo: string) => {
    await chamar(amb, chave, 'DELETE', `/product-invoices/${id}`, { reason: motivo })
  },
  /** Carta de correção (CC-e): texto de 15 a 1000 letras; não corrige valor, imposto, item nem emitente/destinatário */
  corrigirNfe: async (amb: Ambiente, chave: string, id: string, texto: string) =>
    chamar(amb, chave, 'POST', `/product-invoices/${id}/corrections`, { letter: texto }), // a doc diz 'description', a API exige 'letter' (testado 26/11)
  /** Link público do XML (não precisa de chave) */
  urlXml: (amb: Ambiente, modelo: 'nfce' | 'nfe', id: string) => `${baseUrl(amb)}/${modelo === 'nfe' ? 'product-invoices' : 'consumer-invoices'}/${id}/xml`,
  urlPdfNfce: (amb: Ambiente, id: string) => `${baseUrl(amb)}/consumer-invoices/${id}/pdf`,
  urlXmlNfce: (amb: Ambiente, id: string) => `${baseUrl(amb)}/consumer-invoices/${id}/xml`,
}
