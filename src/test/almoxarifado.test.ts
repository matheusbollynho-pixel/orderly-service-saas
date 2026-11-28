import { describe, expect, it } from 'vitest';
import { fracaoDaEmbalagem, origemPadrao, qtdEstoque, textoParte, unidadesDoConteudo } from '@/lib/almoxarifado';

describe('almoxarifado: de onde sai na OS', () => {
  it('só venda sai da loja; uso interno, os dois e produto antigo saem do almoxarifado', () => {
    expect(origemPadrao('venda')).toBe('loja');
    expect(origemPadrao('interno')).toBe('almox');
    expect(origemPadrao('ambos')).toBe('almox');
    expect(origemPadrao(null)).toBe('almox');
  });
});

describe('almoxarifado: parte de uma embalagem', () => {
  it('ml de uma lata em ml, e em litro', () => {
    expect(qtdEstoque(fracaoDaEmbalagem(50, 'ml', 300, 'ml')!)).toBe(0.167);
    expect(fracaoDaEmbalagem(0.15, 'l', 300, 'ml')).toBeCloseTo(0.5);
    expect(fracaoDaEmbalagem(250, 'ml', 1, 'l')).toBe(0.25);
  });
  it('metro e centímetro de um rolo; grama de um pote em kg', () => {
    expect(fracaoDaEmbalagem(2, 'm', 20, 'm')).toBe(0.1);
    expect(fracaoDaEmbalagem(50, 'cm', 20, 'm')).toBe(0.025);
    expect(fracaoDaEmbalagem(100, 'g', 1, 'kg')).toBe(0.1);
  });
  it('unidades que não combinam ou valores inválidos = null', () => {
    expect(fracaoDaEmbalagem(50, 'g', 300, 'ml')).toBeNull();
    expect(fracaoDaEmbalagem(0, 'ml', 300, 'ml')).toBeNull();
    expect(fracaoDaEmbalagem(50, 'ml', 0, 'ml')).toBeNull();
    expect(fracaoDaEmbalagem(50, 'xx', 300, 'ml')).toBeNull();
  });
  it('unidades oferecidas para digitar e texto da parte', () => {
    expect(unidadesDoConteudo('ml')).toEqual(['ml', 'l']);
    expect(unidadesDoConteudo('m')).toEqual(['cm', 'm']);
    expect(unidadesDoConteudo(null)).toEqual([]);
    expect(textoParte(0.5)).toBe('½');
    expect(textoParte(0.25)).toBe('¼');
    expect(textoParte(0.1667)).toBe('0,167');
  });
});
