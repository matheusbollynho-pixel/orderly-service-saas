import { describe, expect, it } from 'vitest';
import { mesmoDevedor } from '@/lib/mesmoDevedor';

const f = (id: string, o: Record<string, string | null> = {}) => ({ id, client_name: 'X', client_phone: null, client_cpf: null, status: 'pendente', ...o });

describe('mesmoDevedor', () => {
  it('junta pelo telefone (ignora DDD/formatação) e o clicado vem primeiro', () => {
    const l = [f('a', { client_phone: '(75) 98888-1111' }), f('b', { client_phone: '75988881111', client_name: 'Outro nome' }), f('c', { client_phone: '75977772222' })];
    expect(mesmoDevedor(l, 'b').map((x) => x.id)).toEqual(['b', 'a']);
  });
  it('junta pelo CPF', () => {
    const l = [f('a', { client_cpf: '123.456.789-00' }), f('b', { client_cpf: '12345678900', client_phone: '75911112222' })];
    expect(mesmoDevedor(l, 'a').map((x) => x.id)).toEqual(['a', 'b']);
  });
  it('sem CPF e telefone, junta pelo nome igual', () => {
    const l = [f('a', { client_name: 'CLECIO' }), f('b', { client_name: ' clecio ' }), f('c', { client_name: 'CLECIO SILVA' })];
    expect(mesmoDevedor(l, 'a').map((x) => x.id)).toEqual(['a', 'b']);
  });
  it('nome igual com telefones diferentes não junta', () => {
    const l = [f('a', { client_name: 'AILTON', client_phone: '75911112222' }), f('b', { client_name: 'AILTON', client_phone: '75933334444' })];
    expect(mesmoDevedor(l, 'a').map((x) => x.id)).toEqual(['a']);
  });
  it('outros já pagos não aparecem', () => {
    const l = [f('a', { client_phone: '75911112222' }), f('b', { client_phone: '75911112222', status: 'pago' })];
    expect(mesmoDevedor(l, 'a').map((x) => x.id)).toEqual(['a']);
  });
});
