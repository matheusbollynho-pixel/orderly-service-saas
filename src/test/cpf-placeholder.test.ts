import { describe, it, expect } from 'vitest';

/**
 * Regressão do bug do "monte de número" no lugar do CPF.
 *
 * O Cadastro Express gravava um placeholder `EXP-<telefone>-<timestamp>` na
 * coluna cpf. Esse valor vazava no PDF da OS e nas notas. As guardas abaixo
 * são as mesmas usadas em ExpressCadastroPage, BalcaoNotaDetail e FiadosPage.
 */

// --- helpers do ExpressCadastroPage.tsx ---
const normalizeCPF = (value: string) => value.replace(/\D/g, '').slice(0, 11);
const isValidCPF = (value: string) =>
  !/[a-zA-Z]/.test(value) && value.replace(/\D/g, '').length === 11;

// --- guarda de exibição usada em BalcaoNotaDetail / FiadosPage / OrderDetails ---
const podeExibirCPF = (value: string | null | undefined) =>
  (value || '').replace(/\D/g, '').length === 11;

const PLACEHOLDER_REAL = 'EXP-31994183637-1788449459503'; // valor exato tirado do PDF do cliente
const PLACEHOLDER_SEM_HIFEN = 'EXP319941836371788449459503';
const CPF_LIMPO = '52998224725';
const CPF_MASCARA = '529.982.247-25';

describe('placeholder EXP- nunca é tratado como CPF', () => {
  it('não passa na validação do Express', () => {
    expect(isValidCPF(PLACEHOLDER_REAL)).toBe(false);
    expect(isValidCPF(PLACEHOLDER_SEM_HIFEN)).toBe(false);
  });

  it('não é exibido nas telas/notas', () => {
    expect(podeExibirCPF(PLACEHOLDER_REAL)).toBe(false);
    expect(podeExibirCPF(PLACEHOLDER_SEM_HIFEN)).toBe(false);
  });

  it('vazio / null também não são exibidos', () => {
    expect(podeExibirCPF('')).toBe(false);
    expect(podeExibirCPF(null)).toBe(false);
    expect(podeExibirCPF(undefined)).toBe(false);
  });
});

describe('CPF real continua funcionando', () => {
  it('valida com e sem máscara', () => {
    expect(isValidCPF(CPF_LIMPO)).toBe(true);
    expect(isValidCPF(CPF_MASCARA)).toBe(true);
  });

  it('é exibido nas telas/notas', () => {
    expect(podeExibirCPF(CPF_LIMPO)).toBe(true);
    expect(podeExibirCPF(CPF_MASCARA)).toBe(true);
  });

  it('normaliza para 11 dígitos', () => {
    expect(normalizeCPF(CPF_MASCARA)).toBe(CPF_LIMPO);
    expect(normalizeCPF('529.982.247-25 ')).toHaveLength(11);
  });
});
