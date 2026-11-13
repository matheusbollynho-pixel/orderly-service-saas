import { describe, expect, it } from 'vitest';
import { semEstornosAnulados } from '@/lib/caixaEstorno';

const l = (id: string, type: string, amount: number, estorno_de: string | null = null) => ({ id, type, amount, estorno_de });

describe('semEstornosAnulados', () => {
  it('tira o par lançamento + estorno do mesmo período', () => {
    const r = semEstornosAnulados([l('a', 'entrada', 3500), l('b', 'saida', 3500, 'a'), l('c', 'entrada', 35)]);
    expect(r.map((x) => x.id)).toEqual(['c']);
  });

  it('mantém o estorno quando o original é de outro período', () => {
    const r = semEstornosAnulados([l('b', 'saida', 100, 'fora'), l('c', 'entrada', 50)]);
    expect(r.map((x) => x.id)).toEqual(['b', 'c']);
  });

  it('mantém o original estornado quando o estorno caiu em outro período', () => {
    const r = semEstornosAnulados([{ ...l('a', 'entrada', 100), estornado_em: '2026-11-02' }]);
    expect(r).toHaveLength(1);
  });

  it('sem estornos devolve a mesma lista', () => {
    const lista = [l('a', 'entrada', 1)];
    expect(semEstornosAnulados(lista)).toBe(lista);
  });
});
