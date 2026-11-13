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

import { documentoDoCliente } from '@/components/v2/BuscaCliente';
describe('documentoDoCliente', () => {
  it('mostra o CPF formatado quando tem', () => {
    expect(documentoDoCliente({ cpf: '12345678900', phone: '75988887777' })).toBe('CPF 123.456.789-00');
  });
  it('sem CPF, mostra o telefone (tira o 55)', () => {
    expect(documentoDoCliente({ cpf: null, whatsapp: '5575988887777' })).toBe('Tel (75) 98888-7777');
    expect(documentoDoCliente({ cpf: '', phone: '7533334444' })).toBe('Tel (75) 3333-4444');
  });
  it('sem nada, vazio', () => {
    expect(documentoDoCliente({})).toBe('');
  });
});
