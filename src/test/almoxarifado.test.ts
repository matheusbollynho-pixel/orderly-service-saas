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

import { abaixoDoMinimoAlmox, produtosDoAlmox } from '@/components/estoque/AbaAlmoxarifado';
describe('almoxarifado: aba', () => {
  const p = (x: Record<string, unknown>) => ({ id: String(x.name), name: String(x.name), active: true, stock_current: 0, ...x }) as never;
  it('mostra quem tem saldo no almox, é de uso interno ou tem mínimo; esconde kit e inativo; ordena por nome', () => {
    const lista = produtosDoAlmox([
      p({ name: 'Zinco', stock_almox: 2 }),
      p({ name: 'Estopa', uso: 'interno', stock_almox: 0 }),
      p({ name: 'Fita', stock_minimo_almox: 3 }),
      p({ name: 'Pastilha', uso: 'venda', stock_almox: 0, stock_current: 10 }),
      p({ name: 'Kit troca de óleo', e_kit: true, stock_almox: 5 }),
      p({ name: 'Velho', active: false, stock_almox: 4 }),
    ]);
    expect(lista.map((x: { name: string }) => x.name)).toEqual(['Estopa', 'Fita', 'Zinco']);
  });
  it('baixo = no mínimo ou abaixo (só quando tem mínimo)', () => {
    expect(abaixoDoMinimoAlmox(p({ name: 'a', stock_almox: 3, stock_minimo_almox: 3 }))).toBe(true);
    expect(abaixoDoMinimoAlmox(p({ name: 'b', stock_almox: 4, stock_minimo_almox: 3 }))).toBe(false);
    expect(abaixoDoMinimoAlmox(p({ name: 'c', stock_almox: 0, stock_minimo_almox: 0 }))).toBe(false);
  });
});

import { custoDoEstoqueNaOs } from '@/lib/almoxarifado';
describe('almoxarifado: custo do estoque na OS', () => {
  it('separa peça cobrada de material de uso; ignora serviço e item digitado', () => {
    const r = custoDoEstoqueNaOs([
      { product_id: 'pastilha', quantidade: '2', valor: 40 },
      { product_id: 'desengripante', quantidade: '0.167', valor: 0 },
      { product_id: null, quantidade: '1', valor: 30 },
      { product_id: 'pastilha', is_service: true, quantidade: '1', valor: 100 },
    ], [{ id: 'pastilha', cost_price: 25 }, { id: 'desengripante', cost_price: 18 }]);
    expect(r).toEqual({ pecas: 50, uso: 3.01, total: 53.01 });
  });
});

import { consumoPorPessoa } from '@/lib/almoxarifado';
describe('almoxarifado: consumo por pessoa', () => {
  it('OS menos devolução (de quem retirou por último), baixa sem OS, sem nome = Não informado; ignora loja', () => {
    const custo = (id: string) => ({ lata: 18, fita: 4 } as Record<string, number>)[id] ?? 0;
    const r = consumoPorPessoa([
      { type: 'saida_os', local: 'almox', quantity: 1, product_id: 'lata', order_id: 'os1', retirado_por: 'Walace' },
      { type: 'saida_os', local: 'almox', quantity: 0.5, product_id: 'lata', order_id: 'os1', retirado_por: 'Aislan' },
      { type: 'devolucao', local: 'almox', quantity: 0.5, product_id: 'lata', order_id: 'os1' }, // desfaz o do Aislan
      { type: 'consumo_interno', local: 'almox', quantity: 2, product_id: 'fita', order_id: null, retirado_por: 'Aislan' },
      { type: 'saida_os', local: 'almox', quantity: 1, product_id: 'fita', order_id: 'os2', retirado_por: null },
      { type: 'saida_os', local: 'loja', quantity: 5, product_id: 'lata', order_id: 'os3', retirado_por: 'Walace' }, // loja: fora
    ], custo);
    expect(r).toEqual([
      { nome: 'Walace', emOs: 18, semOs: 0, total: 18, qtdEmOs: 1, qtdSemOs: 0 },
      { nome: 'Aislan', emOs: 0, semOs: 8, total: 8, qtdEmOs: 0, qtdSemOs: 2 },
      { nome: 'Não informado', emOs: 4, semOs: 0, total: 4, qtdEmOs: 1, qtdSemOs: 0 },
    ]);
  });
});
