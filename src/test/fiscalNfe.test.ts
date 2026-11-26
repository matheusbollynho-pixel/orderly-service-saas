import { describe, expect, it } from 'vitest';
import { CNPJ_SEFAZ_BA, aliquotaInterestadual, autorizadosXml, cfopInterestadual, montarNfe } from '../../supabase/functions/_shared/fiscal/spedy';

const padNormal = { ncm: null, cfop: '5102', csosn: '102', origem: 0, pisCofinsCst: 49, regime: 'normal' as const, icmsAliquota: 20.5, pisCofinsCstNormal: 4 };
const padSimples = { ncm: null, cfop: '5102', csosn: '102', origem: 0, pisCofinsCst: 49 };
const item = (o = {}) => ({ codigo: '001', descricao: 'Pastilha', quantidade: 2, valorUnitario: 50, unidade: 'un', ncm: '87083090', cfop: null, csosn: null, origem: null, ...o });
const dest = (o = {}) => ({
  documento: '33.000.167/0001-01', nome: 'LOJA DE PECAS LTDA', ie: '123456789', ieIndicador: null,
  logradouro: 'RUA A', numero: '10', bairro: 'CENTRO', cep: '48600-000', cidade: 'PAULO AFONSO', uf: 'BA', cidadeIbge: '2924009', ...o,
});
const venda = (o = {}) => ({ idIntegracao: 'n1', itens: [item()], desconto: 0, pagamentos: [{ forma: 'pix', valor: 100 }], destinatario: dest(), ufEmitente: 'BA', ...o });

describe('NF-e', () => {
  it('venda dentro do estado para lojista com IE: contribuinte, não é consumidor final, CFOP 5102, ICMS 20,5', () => {
    const c = montarNfe(venda(), padNormal);
    expect(c.destination).toBe('internal');
    expect(c.isFinalCustomer).toBe(false);
    expect(c.receiver).toMatchObject({ federalTaxNumber: '33000167000101', stateTaxNumberIndicator: 'taxPayer', stateTaxNumber: '123456789', address: { postalCode: '48600000', city: { code: '2924009', state: 'BA' } } });
    expect(c.items[0].cfop).toBe(5102);
    expect(c.items[0].taxes.icms).toMatchObject({ cst: 0, rate: 20.5, amount: 20.5 });
    expect(c.total.icmsAmount).toBe(20.5);
  });
  it('venda para outro estado: CFOP 6102, ICMS 12% (BA→SP), ST vira 6404, importado 4%', () => {
    const c = montarNfe(venda({
      destinatario: dest({ uf: 'SP', cidade: 'SAO PAULO', cidadeIbge: '3550308' }),
      itens: [item(), item({ codigo: '002', csosn: '500' }), item({ codigo: '003', origem: 1 })],
      pagamentos: [],
    }), padNormal);
    expect(c.destination).toBe('interstate');
    expect(c.items.map((i) => i.cfop)).toEqual([6102, 6404, 6102]);
    expect(c.items[0].taxes.icms).toMatchObject({ rate: 12, amount: 12 });
    expect(c.items[1].taxes.icms).toEqual({ origin: 0, cst: 60 });
    expect(c.items[2].taxes.icms).toMatchObject({ rate: 4, amount: 4 });
  });
  it('alíquota e CFOP interestaduais', () => {
    expect(aliquotaInterestadual('BA', 'SP', 0)).toBe(12);
    expect(aliquotaInterestadual('SP', 'BA', 0)).toBe(7);
    expect(aliquotaInterestadual('SP', 'RJ', 0)).toBe(12);
    expect(aliquotaInterestadual('BA', 'PE', 2)).toBe(4);
    expect(cfopInterestadual(5102)).toBe(6102);
    expect(cfopInterestadual(5405)).toBe(6404);
  });
  it('cliente isento de IE e consumidor final no Simples', () => {
    const c = montarNfe(venda({ destinatario: dest({ ie: 'ISENTO' }) }), padSimples);
    expect(c.receiver).toMatchObject({ stateTaxNumberIndicator: 'exempt', stateTaxNumber: 'ISENTO' });
    expect(c.isFinalCustomer).toBe(true);
    expect(c.items[0].taxes.icms).toEqual({ origin: 0, csosn: 102 });
  });
  it('travas: dados faltando, contribuinte sem IE, DIFAL', () => {
    expect(() => montarNfe(venda({ destinatario: dest({ cep: '', cidadeIbge: '' }) }), padNormal)).toThrow(/CEP, código IBGE/);
    expect(() => montarNfe(venda({ destinatario: dest({ ie: '', ieIndicador: 'contribuinte' }) }), padNormal)).toThrow(/sem Inscrição Estadual/);
    expect(() => montarNfe(venda({ destinatario: dest({ ie: '', uf: 'SP' }) }), padNormal)).toThrow(/DIFAL/);
  });
  it('autXML: contador da loja; na Bahia sem contador vai a SEFAZ-BA (rejeição 486)', () => {
    expect(autorizadosXml('12.345.678/0001-95', 'BA')).toEqual(['12345678000195']);
    expect(autorizadosXml(null, 'BA')).toEqual([CNPJ_SEFAZ_BA]);
    expect(autorizadosXml('', 'SP')).toEqual([]);
    const c = montarNfe(venda({ autorizadosXml: autorizadosXml(null, 'BA') }), padNormal);
    expect(c.authorizedPersons).toEqual(['13937073000156']);
  });
});
