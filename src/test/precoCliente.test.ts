import { describe, expect, it } from 'vitest';
import { descricaoComTipo, digitadoParaCliente, economiaUnit, fmtCpf, ondeVale, precoParaCliente, servicoParaCliente, somarDias, tipoEmDia, type TipoCliente } from '@/lib/precoCliente';

const base: TipoCliente = { id: 't', nome: 'Lojista', desconto_pct: 10, usa_preco_atacado: false, validade_dias: 30, compra_minima: 300, ativo: true };

describe('preço por tipo de cliente', () => {
  it('sem tipo = preço normal', () => {
    expect(precoParaCliente({ sale_price: 50, preco_atacado: 40 }, null)).toBe(50);
  });
  it('desconto em %', () => {
    expect(precoParaCliente({ sale_price: 49.9 }, base)).toBe(44.91);
  });
  it('preço de atacado quando o produto tem', () => {
    const t = { ...base, usa_preco_atacado: true, desconto_pct: 0 };
    expect(precoParaCliente({ sale_price: 50, preco_atacado: 38 }, t)).toBe(38);
    expect(precoParaCliente({ sale_price: 50, preco_atacado: null }, t)).toBe(50);
  });
  it('atacado sem preço no produto cai no %', () => {
    const t = { ...base, usa_preco_atacado: true, desconto_pct: 5 };
    expect(precoParaCliente({ sale_price: 100, preco_atacado: 0 }, t)).toBe(95);
  });
  it('validade', () => {
    expect(tipoEmDia(base, '2026-11-25', '2026-11-25')).toBe(true);
    expect(tipoEmDia(base, '2026-11-24', '2026-11-25')).toBe(false);
    expect(tipoEmDia(base, null, '2026-11-25')).toBe(false);
    expect(tipoEmDia({ ...base, validade_dias: null }, null, '2026-11-25')).toBe(true);
    expect(tipoEmDia({ ...base, ativo: false }, '2099-01-01', '2026-11-25')).toBe(false);
  });
  it('serviço da OS só com a chave ligada', () => {
    expect(servicoParaCliente(200, base)).toBe(200);
    expect(servicoParaCliente(200, { ...base, vale_servico_os: true })).toBe(180);
    expect(servicoParaCliente(200, { ...base, vale_servico_os: true, desconto_pct: 0 })).toBe(200);
    expect(servicoParaCliente(200, null)).toBe(200);
    expect(ondeVale({ ...base, vale_servico_os: true })).toBe('Vale em: balcão, peças da OS, serviço da OS, item digitado com 10%');
    expect(ondeVale({ ...base, vale_pecas_os: false, desconto_pct: 0 })).toBe('Vale em: balcão');
    expect(digitadoParaCliente(50, base)).toBe(45);
    expect(digitadoParaCliente(50, { ...base, desconto_pct: 0 })).toBe(50);
    expect(digitadoParaCliente(50, null)).toBe(50);
  });
  it('destaque do preço do tipo', () => {
    expect(economiaUnit({ preco_tabela: 100, tipo_preco: 'Lojista' }, 80)).toBe(20);
    expect(economiaUnit({ preco_tabela: 100, tipo_preco: null }, 80)).toBe(0);
    expect(economiaUnit({ preco_tabela: 100, tipo_preco: 'Lojista' }, 120)).toBe(0);
    expect(descricaoComTipo('Banco', { preco_tabela: 100, tipo_preco: 'Lojista' }, 80)).toBe('Banco (Lojista: de R$ 100,00)');
    expect(descricaoComTipo('Banco', {}, 80)).toBe('Banco');
  });
  it('somar dias e CPF', () => {
    expect(somarDias('2026-11-25', 30)).toBe('2026-12-25');
    expect(fmtCpf('10028878523')).toBe('100.288.785-23');
    expect(fmtCpf('123')).toBe('123');
  });
});
