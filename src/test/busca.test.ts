import { describe, it, expect } from 'vitest';
import { matchesSearch } from '@/lib/textSearch';

describe('matchesSearch (busca por palavras)', () => {
  it('acha sem precisar do nome completo, em qualquer ordem', () => {
    expect(matchesSearch('oleo 20w50', 'Óleo lubrificante 20W50')).toBe(true);
    expect(matchesSearch('20w50 oleo', 'Óleo lubrificante 20W50')).toBe(true);
    expect(matchesSearch('fluido dot 3', 'Fluido de Freio DOT 3 200 ML')).toBe(true);
  });

  it('ignora traço, ponto e espaço dentro do termo', () => {
    expect(matchesSearch('oleo 20w50', 'OLEO SHELL 20W-50')).toBe(true);
    expect(matchesSearch('cg160', 'Vela CG 160 Fan')).toBe(true);
    expect(matchesSearch('20w-50', 'Mobil 20W50')).toBe(true);
  });

  it('procura nos outros campos também (código, marca, modelo)', () => {
    expect(matchesSearch('pastilha bros', 'Pastilha de freio', '013', 'Cobreq', 'Bros 160')).toBe(true);
    expect(matchesSearch('013', 'Fluido de Freio', '013')).toBe(true);
  });

  it('não acha quando falta uma das palavras', () => {
    expect(matchesSearch('oleo 10w30', 'Óleo lubrificante 20W50')).toBe(false);
    expect(matchesSearch('pastilha titan', 'Pastilha de freio', 'Bros 160')).toBe(false);
  });

  it('continua ignorando acento e maiúscula; vazio casa tudo', () => {
    expect(matchesSearch('JOSE', 'José da Silva')).toBe(true);
    expect(matchesSearch('', 'qualquer')).toBe(true);
    expect(matchesSearch('   ', 'qualquer')).toBe(true);
  });

  it('telefone digitado com parênteses e espaço', () => {
    expect(matchesSearch('(75) 9 8838', 'Cliente', '75988388629')).toBe(true);
  });
});
