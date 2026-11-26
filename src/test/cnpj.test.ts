import { describe, expect, it } from 'vitest';
import { cnpjValido, enderecoEmLinha, lerBrasilApi } from '../lib/cnpj';

describe('Buscar CNPJ', () => {
  it('valida dígitos do CNPJ', () => {
    expect(cnpjValido('33.000.167/0001-01')).toBe(true);
    expect(cnpjValido('24890547000178')).toBe(true);
    expect(cnpjValido('33000167000102')).toBe(false);
    expect(cnpjValido('11111111111111')).toBe(false);
    expect(cnpjValido('123')).toBe(false);
  });
  it('lê a resposta da BrasilAPI', () => {
    const d = lerBrasilApi({
      cnpj: '33000167000101', razao_social: 'PETROLEO BRASILEIRO S A PETROBRAS', nome_fantasia: 'PETROBRAS - EDISE',
      descricao_situacao_cadastral: 'ATIVA', descricao_tipo_de_logradouro: 'AVENIDA', logradouro: 'REPUBLICA DO CHILE',
      numero: '65', complemento: '', bairro: 'CENTRO', cep: '20031170', municipio: 'RIO DE JANEIRO', uf: 'rj',
      codigo_municipio_ibge: 3304557, ddd_telefone_1: '2121660000', email: null,
    });
    expect(d).toMatchObject({
      razaoSocial: 'PETROLEO BRASILEIRO S A PETROBRAS', ativa: true, logradouro: 'AVENIDA REPUBLICA DO CHILE',
      numero: '65', cep: '20031170', cidade: 'RIO DE JANEIRO', uf: 'RJ', cidadeIbge: '3304557', telefone: '2121660000', email: '',
    });
    expect(enderecoEmLinha(d)).toBe('AVENIDA REPUBLICA DO CHILE, 65 - CENTRO');
    expect(lerBrasilApi({ descricao_situacao_cadastral: 'BAIXADA', numero: '' })).toMatchObject({ ativa: false, numero: 'S/N' });
  });
});
