import { deveEmitirAuto, diasParaVencer, faixasSeguidas, textoFaixa } from '../lib/fiscal';
import { describe, expect, it } from 'vitest';
import { agoraBrasilia, certificadoAtivo, formaSpedy, lerInutilizacao, mensagemErro, motivoNota, montarNfce, statusSpedy } from '../../supabase/functions/_shared/fiscal/spedy';

const pad = { ncm: null, cfop: '5102', csosn: '102', origem: 0, pisCofinsCst: 49 };
const item = (o: Partial<Parameters<typeof montarNfce>[0]['itens'][number]> = {}) => ({
  codigo: '001', descricao: 'Camara de ar', quantidade: 2, valorUnitario: 28, unidade: 'un',
  ncm: '40131090', cfop: null, csosn: null, origem: null, ...o,
});

describe('NFC-e Spedy', () => {
  it('monta itens, impostos e total', () => {
    const c = montarNfce({ idIntegracao: 'abc', itens: [item()], desconto: 0, pagamentos: [{ forma: 'cartao', valor: 56 }] }, pad);
    expect(c.items[0]).toMatchObject({ code: '001', ncm: '40131090', cfop: 5102, unit: 'UN', quantity: 2, unitAmount: 28, totalAmount: 56, taxes: { icms: { origin: 0, csosn: 102 }, pis: { cst: 49 }, cofins: { cst: 49 } } });
    expect(c.payments).toEqual([{ method: 'creditCard', amount: 56 }]);
    expect(c.total).toEqual({ invoiceAmount: 56, productAmount: 56 });
    expect(c.presenceType).toBe('presence');
    expect('receiver' in c).toBe(false);
  });
  it('desconto dividido pelo peso de cada item, fechando a conta', () => {
    const c = montarNfce({
      idIntegracao: 'x', desconto: 10,
      itens: [item({ quantidade: 1, valorUnitario: 30 }), item({ codigo: '002', quantidade: 1, valorUnitario: 70, csosn: '500', cfop: '5405', origem: 2 })],
      pagamentos: [{ forma: 'pix', valor: 90 }],
    }, pad);
    expect(c.items.map((i) => (i as { discountAmount?: number }).discountAmount)).toEqual([3, 7]);
    expect(c.items[1]).toMatchObject({ cfop: 5405, taxes: { icms: { origin: 2, csosn: 500 } } });
    expect(c.total).toEqual({ invoiceAmount: 90, productAmount: 100, discountAmount: 10 });
    expect(c.payments).toEqual([{ method: 'pix', amount: 90 }]);
  });
  it('pagamento dividido só vale se fechar com o total', () => {
    const ok = montarNfce({ idIntegracao: 'x', desconto: 0, itens: [item()], pagamentos: [{ forma: 'dinheiro', valor: 20 }, { forma: 'cartao_debito', valor: 36 }] }, pad);
    expect(ok.payments).toEqual([{ method: 'money', amount: 20 }, { method: 'debitCard', amount: 36 }]);
    const nao = montarNfce({ idIntegracao: 'x', desconto: 0, itens: [item()], pagamentos: [{ forma: 'dinheiro', valor: 0 }] }, pad);
    expect(nao.payments).toEqual([{ method: 'money', amount: 56 }]);
  });
  it('CPF do cliente vai no destinatário', () => {
    const c = montarNfce({ idIntegracao: 'x', desconto: 0, itens: [item()], pagamentos: [], cpf: '100.288.785-23' }, pad);
    expect(c.receiver).toEqual({ federalTaxNumber: '10028878523' });
  });
  it('sem NCM: erro claro; com NCM padrão da loja, passa', () => {
    expect(() => montarNfce({ idIntegracao: 'x', desconto: 0, itens: [item({ ncm: null, descricao: 'Capa sob medida' })], pagamentos: [] }, pad)).toThrow(/Capa sob medida/);
    const c = montarNfce({ idIntegracao: 'x', desconto: 0, itens: [item({ ncm: null })], pagamentos: [] }, { ...pad, ncm: '87149990' });
    expect(c.items[0].ncm).toBe('87149990');
  });
  it('status e formas', () => {
    expect(statusSpedy('authorized')).toBe('autorizada');
    expect(statusSpedy('enqueued')).toBe('processando');
    expect(statusSpedy('inContingent')).toBe('contingencia');
    expect(formaSpedy('fiado')).toBe('storeCredit');
    expect(formaSpedy('xyz')).toBe('other');
  });
  it('erro do fornecedor em português', () => {
    expect(mensagemErro(401, [{ message: 'Usuário não autenticado.', path: null }])).toMatch(/recusou a chave/);
    expect(mensagemErro(400, [{ message: 'NCM inválido', path: 'items[0].ncm' }])).toBe('Nota recusada: NCM inválido (items[0].ncm)');
    expect(mensagemErro(422, { errors: ['CPF inválido'] })).toBe('Nota recusada: CPF inválido');
    expect(mensagemErro(503, 'x')).toMatch(/fora do ar/);
  });
  it('regime normal: CST 00 com ICMS calculado, item com ST vira CST 60 / 5405, PIS/COFINS com valor', () => {
    const normal = { ...pad, regime: 'normal' as const, icmsAliquota: 20.5, pisCofinsCstNormal: 1, pisAliquota: 0.65, cofinsAliquota: 3 };
    const c = montarNfce({
      idIntegracao: 'x', desconto: 10,
      itens: [item({ quantidade: 1, valorUnitario: 100 }), item({ codigo: '002', quantidade: 1, valorUnitario: 100, csosn: '500' })],
      pagamentos: [],
    }, normal);
    expect(c.items[0].cfop).toBe(5102);
    expect(c.items[0].taxes.icms).toEqual({ origin: 0, cst: 0, baseTaxModality: 3, baseTax: 95, baseTaxReduction: 0, rate: 20.5, amount: 19.48 });
    expect(c.items[0].taxes.pis).toEqual({ cst: 1, baseTax: 95, rate: 0.65, amount: 0.62 });
    expect(c.items[1].cfop).toBe(5405);
    expect(c.items[1].taxes.icms).toEqual({ origin: 0, cst: 60 });
    expect(c.total).toMatchObject({ invoiceAmount: 190, icmsBaseTax: 95, icmsAmount: 19.48, pisAmount: 1.24, cofinsAmount: 5.7 });
  });
  it('regime normal: monofásico (CST 4) só leva o código; sem alíquota de ICMS dá erro claro', () => {
    const mono = montarNfce({ idIntegracao: 'x', desconto: 0, itens: [item()], pagamentos: [] }, { ...pad, regime: 'normal', icmsAliquota: 20.5, pisCofinsCstNormal: 4 });
    expect(mono.items[0].taxes.pis).toEqual({ cst: 4 });
    expect(mono.total).toMatchObject({ pisAmount: 0, cofinsAmount: 0 });
    expect(() => montarNfce({ idIntegracao: 'x', desconto: 0, itens: [item()], pagamentos: [] }, { ...pad, regime: 'normal' })).toThrow(/alíquota de ICMS/);
  });
  it('horário de Brasília para a emissão', () => {
    expect(agoraBrasilia(new Date('2026-11-25T23:05:09Z'))).toBe('2026-11-25T20:05:09');
    expect(agoraBrasilia(new Date('2026-11-26T02:30:00Z'))).toBe('2026-11-25T23:30:00');
    const c = montarNfce({ idIntegracao: 'x', desconto: 0, itens: [item()], pagamentos: [], emitidaEm: '2026-11-25T20:05:09' }, pad);
    expect(c.issuedOn).toBe('2026-11-25T20:05:09');
  });
  it('regime normal Bahia: ICMS 18 + FCP 2,5 destacado; PIS/COFINS monofásico da loja e tributável no produto', () => {
    const ba = { ...pad, regime: 'normal' as const, icmsAliquota: 18, fcpAliquota: 2.5, pisCofinsCstNormal: 4 };
    const c = montarNfce({
      idIntegracao: 'x', desconto: 0,
      itens: [item({ quantidade: 1, valorUnitario: 100 }), item({ codigo: 'CAP', descricao: 'Capacete', quantidade: 1, valorUnitario: 200, pisCofinsCst: 1 })],
      pagamentos: [],
    }, ba);
    expect(c.items[0].taxes.icms).toMatchObject({ cst: 0, rate: 18, amount: 18, fcpRate: 2.5, fcpAmount: 2.5 });
    expect(c.items[0].taxes.pis).toEqual({ cst: 4 });
    expect(c.items[1].taxes.pis).toEqual({ cst: 1, baseTax: 200, rate: 0.65, amount: 1.3 });
    expect(c.total).toMatchObject({ invoiceAmount: 300, icmsBaseTax: 300, icmsAmount: 54, fcpAmount: 7.5, pisAmount: 1.3, cofinsAmount: 6 });
  });
  it('números pulados viram faixas seguidas', () => {
    expect(faixasSeguidas([4, 1, 2, 3, 7, 9, 8, 2])).toEqual([[1, 4], [7, 9]]);
    expect(faixasSeguidas([5])).toEqual([[5, 5]]);
    expect(textoFaixa([1, 4])).toBe('1 a 4');
    expect(textoFaixa([5, 5])).toBe('5');
  });
  it('lê a resposta da inutilização (formato real da Spedy)', () => {
    expect(lerInutilizacao({ id: 'a', status: 'rejected', protocolNumber: null, messageCode: '998', messageText: 'Uso Denegado: Emissao monitorada de NF-e.\n      Procurar a Delegacia' }))
      .toEqual({ idFornecedor: 'a', status: 'rejeitada', protocolo: null, motivo: '998 - Uso Denegado: Emissao monitorada de NF-e. Procurar a Delegacia' });
    expect(lerInutilizacao({ id: 'b', status: 'authorized', protocolNumber: '129260000001', messageCode: '102', messageText: 'Inutilizacao de numero homologado' }).status).toBe('inutilizada');
    expect(lerInutilizacao({ id: 'c', status: 'enqueued' }).status).toBe('processando');
  });
  it('certificado: validade e dias para vencer', () => {
    const hoje = new Date('2026-11-25T12:00:00Z');
    expect(diasParaVencer('2027-01-09T17:55:18', hoje)).toBe(45);
    expect(diasParaVencer('2026-11-20T00:00:00Z', hoje)).toBeLessThan(0);
    expect(diasParaVencer(null, hoje)).toBeNull();
    expect(certificadoAtivo([
      { expirationAt: '2026-01-01T00:00:00', subject: 'VELHO:24890547000178', isActive: false },
      { expirationAt: '2027-01-09T17:55:18', subject: 'MATHEUS:24890547000178', isActive: true },
    ])).toEqual({ validade: '2027-01-09T17:55:18', titular: 'MATHEUS:24890547000178', ativo: true });
    expect(certificadoAtivo([])).toBeNull();
  });
  it('nota automática: só cartão / todas / não', () => {
    expect(deveEmitirAuto('cartao', ['cartao_credito'])).toBe(true);
    expect(deveEmitirAuto('cartao', ['dinheiro', 'cartao_debito'])).toBe(true);
    expect(deveEmitirAuto('cartao', ['pix'])).toBe(false);
    expect(deveEmitirAuto('cartao', ['fiado'])).toBe(false);
    expect(deveEmitirAuto('todas', ['pix'])).toBe(true);
    expect(deveEmitirAuto('nao', ['cartao_credito'])).toBe(false);
    expect(deveEmitirAuto(undefined, ['cartao_credito'])).toBe(false);
  });
  it('motivo: recusa da nota e cancelamento recusado em nota autorizada', () => {
    expect(motivoNota('rejeitada', { code: '462', message: 'CSC', status: 'success' })).toBe('462 - CSC');
    expect(motivoNota('autorizada', { code: '494', message: 'Rejeicao: Chave de acesso inexistente', status: 'failed' })).toMatch(/continua valendo.*494/);
    expect(motivoNota('autorizada', { code: '100', message: 'Autorizado o uso', status: 'success' })).toBeNull();
    expect(motivoNota('cancelada', { code: '135', message: 'Cancelamento homologado', status: 'success' })).toBeNull();
  });
});

import { dataBrasilia } from '../../supabase/functions/_shared/fiscal/spedy';
describe('horário que a Spedy devolve', () => {
  it('sem fuso = horário de Brasília', () => {
    expect(dataBrasilia('2026-11-26T09:18:13')).toBe('2026-11-26T09:18:13-03:00');
    expect(new Date(dataBrasilia('2026-11-26T09:18:13')!).toISOString()).toBe('2026-11-26T12:18:13.000Z');
  });
  it('com fuso fica como veio; vazio = null', () => {
    expect(dataBrasilia('2026-11-26T12:18:13Z')).toBe('2026-11-26T12:18:13Z');
    expect(dataBrasilia('2026-11-26T09:18:13-03:00')).toBe('2026-11-26T09:18:13-03:00');
    expect(dataBrasilia('')).toBeNull();
    expect(dataBrasilia(undefined)).toBeNull();
  });
});
