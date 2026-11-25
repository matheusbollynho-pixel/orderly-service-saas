import { describe, expect, it } from 'vitest';
import { lerMarcas, repAtende } from '@/lib/marcasRep';

describe('marcas por representante', () => {
  it('lê a lista sem repetir', () => {
    expect(lerMarcas('Vonnixx, AGT ,  vonnixx;Cofap')).toEqual(['Vonnixx', 'AGT', 'Cofap']);
    expect(lerMarcas('  ')).toEqual([]);
  });
  it('quem recebe cada peça', () => {
    expect(repAtende(['Vonnixx', 'AGT'], 'vonnixx')).toBe(true);   // mesma marca, sem ligar pra maiúscula
    expect(repAtende(['Vonnixx', 'AGT'], 'Cofap')).toBe(false);    // marca de outro representante
    expect(repAtende(['Vonnixx'], null)).toBe(true);               // peça sem marca: pode pedir a qualquer um
    expect(repAtende([], 'Cofap')).toBe(true);                     // representante sem marcas = vende de tudo
    expect(repAtende(['Metal Leve'], 'METAL  LEVE')).toBe(true);
  });
});
