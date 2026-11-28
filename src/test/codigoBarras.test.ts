import { describe, expect, it } from 'vitest';
import { produtoPeloCodigo } from '@/lib/codigoBarras';

const lista = [
  { id: 'a', barcode: '7891234567890', code: 'P001' },
  { id: 'b', barcode: null, code: '7891234567890' }, // código interno igual ao EAN de outro
  { id: 'c', barcode: '789000', code: 'OLEO20' },
];

describe('leitor de código de barras', () => {
  it('acha pelo código de barras exato (prioridade) e pelo código interno', () => {
    expect(produtoPeloCodigo(lista, '7891234567890')?.id).toBe('a');
    expect(produtoPeloCodigo(lista, ' 789000 ')?.id).toBe('c');
    expect(produtoPeloCodigo(lista, 'oleo20')?.id).toBe('c');
  });
  it('não pega pedaço de código, nome com espaço nem texto curto', () => {
    expect(produtoPeloCodigo(lista, '7891234')).toBeNull();
    expect(produtoPeloCodigo(lista, 'oleo 20')).toBeNull();
    expect(produtoPeloCodigo(lista, 'P0')).toBeNull();
  });
});
