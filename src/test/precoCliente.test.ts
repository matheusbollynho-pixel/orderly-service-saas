import { describe, expect, it } from 'vitest';
import { fmtCpf, ondeVale, precoParaCliente, servicoParaCliente, somarDias, tipoEmDia, type TipoCliente } from '@/lib/precoCliente';

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
    expect(ondeVale({ ...base, vale_servico_os: true })).toBe('Vale em: balcão, peças da OS, serviço da OS');
    expect(ondeVale({ ...base, vale_pecas_os: false })).toBe('Vale em: balcão');
  });
  it('somar dias e CPF', () => {
    expect(somarDias('2026-11-25', 30)).toBe('2026-12-25');
    expect(fmtCpf('10028878523')).toBe('100.288.785-23');
    expect(fmtCpf('123')).toBe('123');
  });
});
