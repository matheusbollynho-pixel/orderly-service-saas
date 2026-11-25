// Lê o XML da NF-e do fornecedor (modelo 55). Só o que a entrada de estoque precisa.
// Aceita o XML "nfeProc" (com protocolo) ou só a "NFe".

export interface LoteNfe { numero: string | null; quantidade: number; fabricacao: string | null; validade: string | null }
export interface ItemNfe {
  n: number;
  codigo: string;
  ean: string | null;
  descricao: string;
  ncm: string | null;
  cest: string | null;
  cfop: string | null;
  unidade: string;
  quantidade: number;
  valorUnit: number;
  valorTotal: number;
  /** desconto, frete, seguro, outras despesas, IPI e ICMS-ST do item */
  desconto: number; frete: number; seguro: number; outros: number; ipi: number; icmsSt: number;
  lotes: LoteNfe[];
  /** Origem da mercadoria (0 nacional, 1/2 estrangeira...) */
  origem: number | null;
  /** CST ou CSOSN do ICMS na nota do fornecedor */
  cstFornecedor: string | null;
  /** O fornecedor vendeu com substituição tributária (ICMS já pago antes) */
  comSt: boolean;
}

/** Sugestão fiscal para a VENDA da loja (Simples Nacional): com ST → CSOSN 500 / CFOP 5405; sem → 102 / 5102 */
export function fiscalSugerido(it: Pick<ItemNfe, 'comSt'>): { csosn: string; cfop: string } {
  return it.comSt ? { csosn: '500', cfop: '5405' } : { csosn: '102', cfop: '5102' };
}
export interface NotaNfe {
  chave: string;
  numero: string;
  serie: string;
  emitidaEm: string | null;
  fornecedor: { nome: string; fantasia: string | null; cnpj: string };
  valorTotal: number;
  itens: ItemNfe[];
}

const num = (v: string | null | undefined) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
// Ignora o namespace (o XML da NF-e usa xmlns="http://www.portalfiscal.inf.br/nfe")
const todos = (no: Element | Document, tag: string) => Array.from(no.getElementsByTagNameNS('*', tag));
const um = (no: Element | Document | null | undefined, tag: string) => (no ? todos(no, tag)[0] ?? null : null);
const txt = (no: Element | Document | null | undefined, tag: string) => um(no, tag)?.textContent?.trim() ?? null;
const data = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);

export function lerNfe(xml: string): NotaNfe {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Arquivo não é um XML válido.');
  const inf = um(doc, 'infNFe');
  if (!inf) throw new Error('Esse XML não é de uma nota fiscal eletrônica (NF-e).');
  const chave = (inf.getAttribute('Id') || txt(doc, 'chNFe') || '').replace(/\D/g, '');
  if (chave.length !== 44) throw new Error('Não achei a chave da nota (44 dígitos) no XML.');
  const ide = um(inf, 'ide');
  const emit = um(inf, 'emit');
  const total = um(um(inf, 'total'), 'ICMSTot');

  const itens: ItemNfe[] = todos(inf, 'det').map((det, i) => {
    const prod = um(det, 'prod');
    const imp = um(det, 'imposto');
    const ean = txt(prod, 'cEAN') || txt(prod, 'cEANTrib');
    const ipiTrib = um(um(imp, 'IPI'), 'IPITrib');
    // ICMS-ST: vICMSST em qualquer grupo de ICMS do item
    const icms = um(imp, 'ICMS');
    // O grupo de ICMS (ICMS00, ICMS60, ICMSSN500...) é o primeiro filho de <ICMS>
    const grupo = icms ? (Array.from(icms.children)[0] ?? null) : null;
    const origemTxt = txt(grupo, 'orig');
    const cst = txt(grupo, 'CST') || txt(grupo, 'CSOSN');
    const cfop = txt(prod, 'CFOP');
    const lotes = todos(prod as Element, 'rastro').map((r) => ({
      numero: txt(r, 'nLote'),
      quantidade: num(txt(r, 'qLote')),
      fabricacao: data(txt(r, 'dFab')),
      validade: data(txt(r, 'dVal')),
    })).filter((l) => l.quantidade > 0);
    return {
      n: Number(det.getAttribute('nItem')) || i + 1,
      codigo: txt(prod, 'cProd') || '',
      ean: ean && /^\d{8,14}$/.test(ean) ? ean : null, // "SEM GTIN" vira nulo
      descricao: txt(prod, 'xProd') || '',
      ncm: txt(prod, 'NCM'),
      cest: txt(prod, 'CEST'),
      cfop,
      unidade: (txt(prod, 'uCom') || 'UN').toUpperCase(),
      quantidade: num(txt(prod, 'qCom')),
      valorUnit: num(txt(prod, 'vUnCom')),
      valorTotal: num(txt(prod, 'vProd')),
      desconto: num(txt(prod, 'vDesc')),
      frete: num(txt(prod, 'vFrete')),
      seguro: num(txt(prod, 'vSeg')),
      outros: num(txt(prod, 'vOutro')),
      ipi: num(txt(ipiTrib, 'vIPI')),
      icmsSt: num(txt(icms, 'vICMSST')),
      lotes,
      origem: origemTxt != null && /^\d$/.test(origemTxt) ? Number(origemTxt) : null,
      cstFornecedor: cst,
      comSt: /^[56]40[1-5]$/.test(cfop || '') || ['10', '30', '60', '70', '201', '202', '203', '500'].includes(cst || '') || num(txt(grupo, 'vICMSSTRet')) > 0,
    };
  });

  return {
    chave,
    numero: txt(ide, 'nNF') || '',
    serie: txt(ide, 'serie') || '',
    emitidaEm: txt(ide, 'dhEmi') || txt(ide, 'dEmi'),
    fornecedor: { nome: txt(emit, 'xNome') || '', fantasia: txt(emit, 'xFant'), cnpj: (txt(emit, 'CNPJ') || txt(emit, 'CPF') || '').replace(/\D/g, '') },
    valorTotal: num(txt(total, 'vNF')),
    itens,
  };
}

/** Custo de UMA unidade da loja: valor do item (− desconto + frete, seguro, outras, IPI e ST se pedir) ÷ (quantidade × fator) */
export function custoUnitario(it: ItemNfe, fator: number, somarImpostosEFrete: boolean): number {
  const base = it.valorTotal - it.desconto + (somarImpostosEFrete ? it.frete + it.seguro + it.outros + it.ipi + it.icmsSt : 0);
  const qtd = it.quantidade * (fator > 0 ? fator : 1);
  return qtd > 0 ? Math.round((base / qtd) * 10000) / 10000 : 0;
}
