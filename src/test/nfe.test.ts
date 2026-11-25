import { describe, expect, it } from 'vitest';
import { custoUnitario, fiscalSugerido, lerNfe } from '@/lib/nfe';

// Nota fictícia no formato real (nfeProc com namespace)
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
 <NFe><infNFe Id="NFe29251112345678000190550010000012341000012345" versao="4.00">
  <ide><nNF>1234</nNF><serie>1</serie><dhEmi>2026-11-20T10:30:00-03:00</dhEmi></ide>
  <emit><CNPJ>12345678000190</CNPJ><xNome>DISTRIBUIDORA TESTE LTDA</xNome><xFant>DIST TESTE</xFant></emit>
  <det nItem="1">
   <prod><cProd>ABC-01</cProd><cEAN>7891234567895</cEAN><xProd>COURO SINTETICO PRETO</xProd><NCM>39211900</NCM><CEST>1234567</CEST>
    <CFOP>5102</CFOP><uCom>CX</uCom><qCom>2.0000</qCom><vUnCom>120.0000</vUnCom><vProd>240.00</vProd><vDesc>10.00</vDesc><vFrete>20.00</vFrete>
    <rastro><nLote>L1</nLote><qLote>1.000</qLote><dFab>2026-10-01</dFab><dVal>2027-10-01</dVal></rastro>
    <rastro><nLote>L2</nLote><qLote>1.000</qLote><dFab>2026-10-05</dFab><dVal>2027-10-05</dVal></rastro>
   </prod>
   <imposto><ICMS><ICMS10><orig>0</orig><CST>10</CST><vICMSST>5.00</vICMSST></ICMS10></ICMS><IPI><IPITrib><vIPI>5.00</vIPI></IPITrib></IPI></imposto>
  </det>
  <det nItem="2">
   <prod><cProd>XYZ</cProd><cEAN>SEM GTIN</cEAN><xProd>COLA DE CONTATO 1L</xProd><NCM>35069110</NCM><CFOP>5102</CFOP>
    <uCom>un</uCom><qCom>3</qCom><vUnCom>30.00</vUnCom><vProd>90.00</vProd></prod>
   <imposto><ICMS><ICMSSN102><orig>2</orig><CSOSN>102</CSOSN></ICMSSN102></ICMS></imposto>
  </det>
  <total><ICMSTot><vNF>350.00</vNF></ICMSTot></total>
 </infNFe></NFe>
 <protNFe><infProt><chNFe>29251112345678000190550010000012341000012345</chNFe></infProt></protNFe>
</nfeProc>`;

describe('leitura do XML da NF-e', () => {
  const n = lerNfe(XML);
  it('cabeçalho', () => {
    expect(n.chave).toBe('29251112345678000190550010000012341000012345');
    expect(n.numero).toBe('1234');
    expect(n.fornecedor).toEqual({ nome: 'DISTRIBUIDORA TESTE LTDA', fantasia: 'DIST TESTE', cnpj: '12345678000190' });
    expect(n.valorTotal).toBe(350);
    expect(n.itens).toHaveLength(2);
  });
  it('item com lote, impostos e frete', () => {
    const a = n.itens[0];
    expect(a).toMatchObject({ codigo: 'ABC-01', ean: '7891234567895', unidade: 'CX', quantidade: 2, valorTotal: 240, desconto: 10, frete: 20, ipi: 5, icmsSt: 5, ncm: '39211900' });
    expect(a.lotes).toEqual([
      { numero: 'L1', quantidade: 1, fabricacao: '2026-10-01', validade: '2027-10-01' },
      { numero: 'L2', quantidade: 1, fabricacao: '2026-10-05', validade: '2027-10-05' },
    ]);
  });
  it('SEM GTIN vira nulo e unidade maiúscula', () => {
    expect(n.itens[1]).toMatchObject({ ean: null, unidade: 'UN', quantidade: 3, lotes: [] });
  });
  it('fiscal: origem, CST e sugestão para a venda', () => {
    expect(n.itens[0]).toMatchObject({ origem: 0, cstFornecedor: '10', comSt: true });
    expect(fiscalSugerido(n.itens[0])).toEqual({ csosn: '500', cfop: '5405' });
    expect(n.itens[1]).toMatchObject({ origem: 2, cstFornecedor: '102', comSt: false });
    expect(fiscalSugerido(n.itens[1])).toEqual({ csosn: '102', cfop: '5102' });
  });
  it('custo unitário', () => {
    // (240 - 10 + 20 + 5 + 5) / (2 caixas × 12) = 260/24
    expect(custoUnitario(n.itens[0], 12, true)).toBeCloseTo(10.8333, 3);
    // sem impostos/frete: 230 / 2
    expect(custoUnitario(n.itens[0], 1, false)).toBe(115);
    expect(custoUnitario(n.itens[1], 1, true)).toBe(30);
  });
  it('erros', () => {
    expect(() => lerNfe('isso não é xml <')).toThrow();
    expect(() => lerNfe('<a><b/></a>')).toThrow(/NF-e/);
  });
});
