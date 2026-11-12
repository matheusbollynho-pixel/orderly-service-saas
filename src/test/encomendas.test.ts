import { describe, it, expect } from 'vitest';
import {
  mensagemCliente, saldoEncomenda, totalEncomenda, ultimoPrecoCobrado, primeiroNome, type Encomenda,
} from '@/hooks/useEncomendas';

// toLocaleString usa espaço não-quebrável depois do R$
const sp = (t: string) => t.replace(/ /g, ' ');

const base = {
  id: 'e1', client_id: null, motorcycle_id: null, service_order_id: null, cotacao_item_id: null,
  cliente_nome: 'JOÃO da Silva', cliente_whatsapp: '75999999999', moto: 'Titan 160 2020',
  peca: 'Pisca rd 135', quantidade: 2, origem: 'balcao', urgente: false, status: 'aguardando_cotacao',
  custo: 10, preco_venda: 25, prazo_texto: 'sexta (13/11)', pago_adiantado: 20, observacao: null,
  avisado_em: null, aprovado_em: null, pedido_em: null, chegou_em: null, entregue_em: null, desistiu_em: null,
  created_at: '2026-11-11T10:00:00Z',
} as Encomenda;

describe('contas da encomenda', () => {
  it('total = preço × quantidade; saldo desconta o adiantado', () => {
    expect(totalEncomenda(base)).toBe(50);
    expect(saldoEncomenda(base)).toBe(30);
  });
  it('sem preço: null', () => {
    expect(totalEncomenda({ ...base, preco_venda: null })).toBeNull();
    expect(saldoEncomenda({ ...base, preco_venda: null })).toBeNull();
  });
  it('adiantado maior que o total não fica negativo', () => {
    expect(saldoEncomenda({ ...base, pago_adiantado: 999 })).toBe(0);
  });
});

describe('mensagens pro cliente', () => {
  it('primeiro nome arrumado', () => {
    expect(primeiroNome('JOÃO da Silva')).toBe('João');
  });
  it('orçamento com preço total, moto e prazo', () => {
    expect(sp(mensagemCliente('orcamento', base))).toBe('Oi João! A peça Pisca rd 135 (2) da sua Titan 160 2020 fica R$ 50,00, chega sexta (13/11). Posso pedir?');
  });
  it('chegou SEM valor por padrão (não soa como cobrança)', () => {
    const m = mensagemCliente('chegou', base);
    expect(m).toBe('Oi João! Sua peça (Pisca rd 135 (2)) chegou! Pode vir buscar.');
    expect(m).not.toContain('R$');
  });
  it('chegou COM valor quando marcado: mostra só o que falta', () => {
    expect(sp(mensagemCliente('chegou', base, true))).toContain('Fica R$ 30,00 na retirada.');
  });
  it('chegou com tudo pago: não fala de valor mesmo marcado', () => {
    expect(mensagemCliente('chegou', { ...base, pago_adiantado: 50 }, true)).not.toContain('R$');
  });
  it('já pedi', () => {
    expect(mensagemCliente('ja_pedi', base)).toBe('Oi João! Já pedi sua peça (Pisca rd 135 (2)), chega sexta (13/11). Te aviso quando chegar!');
  });
});

describe('último preço cobrado', () => {
  it('acha a mesma peça com ou sem acento/maiúscula, a mais recente, ignorando a própria', () => {
    const todas = [
      base,
      { ...base, id: 'a', peca: 'PISCA RD 135', preco_venda: 20, created_at: '2026-10-01T00:00:00Z' },
      { ...base, id: 'b', peca: 'pisca  rd 135', preco_venda: 22, created_at: '2026-11-01T00:00:00Z' },
      { ...base, id: 'c', peca: 'cabo acelerador', preco_venda: 99, created_at: '2026-11-10T00:00:00Z' },
    ] as Encomenda[];
    expect(ultimoPrecoCobrado(todas, base)?.id).toBe('b');
  });
});
