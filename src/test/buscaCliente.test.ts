import { describe, it, expect, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
import { tipoDaBusca } from '@/components/v2/BuscaCliente';

describe('tipoDaBusca (o que a pessoa digitou)', () => {
  it('placa antiga, Mercosul, com hífen ou só o começo', () => {
    expect(tipoDaBusca('SAI9A08')).toBe('placa');
    expect(tipoDaBusca('abc-1234')).toBe('placa');
    expect(tipoDaBusca('abc 1d23')).toBe('placa');
    expect(tipoDaBusca('FVT2')).toBe('placa');
  });
  it('telefone ou CPF (só números, com ou sem máscara)', () => {
    expect(tipoDaBusca('(75) 98838-8629')).toBe('telefone');
    expect(tipoDaBusca('8629')).toBe('telefone');
    expect(tipoDaBusca('123.456.789-00')).toBe('telefone');
  });
  it('nome, mesmo com número no meio', () => {
    expect(tipoDaBusca('João Silva')).toBe('nome');
    expect(tipoDaBusca('joao2')).toBe('nome');
    expect(tipoDaBusca('Bandara')).toBe('nome');
  });
});
