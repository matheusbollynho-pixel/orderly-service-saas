import { describe, expect, it } from 'vitest';
import { deveAvisar, montarAvisoLojista, primeiroNome, type CandidatoAviso } from '../../supabase/functions/_shared/avisoLojista';

const dados = { nome: 'João', grupo: 'Lojista', loja: 'Rei Acessórios', validoAte: '2026-11-28', hoje: '2026-11-25', compraMinima: 300, validadeDias: 30 };

describe('aviso de preço especial vencendo', () => {
  it('mensagem padrão', () => {
    const m = montarAvisoLojista(null, dados);
    expect(m).toContain('Oi, João!');
    expect(m).toContain('*Lojista*');
    expect(m).toContain('*Rei Acessórios*');
    expect(m).toContain('vence em 3 dias (28/11/2026)');
    expect(m).toContain('a partir de *R$ 300,00* renova por mais 30 dias');
  });
  it('amanhã, hoje e sem mínimo', () => {
    expect(montarAvisoLojista(null, { ...dados, validoAte: '2026-11-26' })).toContain('vence amanhã');
    expect(montarAvisoLojista(null, { ...dados, validoAte: '2026-11-25' })).toContain('vence hoje');
    expect(montarAvisoLojista(null, { ...dados, compraMinima: 0 })).toContain('Qualquer compra renova por mais 30 dias');
  });
  it('texto próprio com variáveis', () => {
    expect(montarAvisoLojista('{{nome}}, seu {{grupo}} na {{empresa}} vence {{data}}. Mínimo {{minimo}}.', dados)).toBe('João, seu Lojista na Rei Acessórios vence 28/11/2026. Mínimo R$ 300,00.');
    expect(montarAvisoLojista('{nome} {grupo}', dados)).toBe('João Lojista');
  });
  it('primeiro nome', () => {
    expect(primeiroNome('MATHEUS DA SILVA')).toBe('Matheus');
    expect(primeiroNome('')).toBe('');
  });

  const base: CandidatoAviso = {
    tipo_valido_ate: '2026-11-28', tipo_aviso_para: null, tipo_aviso_tentativas: 0, active: true, autoriza_lembretes: true,
    phone: '75999990000', whatsapp: null, tipos_cliente: { ativo: true, validade_dias: 30, aviso_dias: 3 },
  };
  it('quem recebe', () => {
    const hoje = '2026-11-25';
    expect(deveAvisar(base, hoje)).toBe(true);
    expect(deveAvisar({ ...base, tipo_valido_ate: '2026-11-29' }, hoje)).toBe(false); // 4 dias: ainda não
    expect(deveAvisar({ ...base, tipo_valido_ate: '2026-11-24' }, hoje)).toBe(false); // já venceu
    expect(deveAvisar({ ...base, tipo_aviso_para: '2026-11-28' }, hoje)).toBe(false); // já avisou
    expect(deveAvisar({ ...base, tipo_aviso_para: '2026-10-29' }, hoje)).toBe(true); // avisou a validade anterior
    expect(deveAvisar({ ...base, autoriza_lembretes: false }, hoje)).toBe(false);
    expect(deveAvisar({ ...base, phone: null }, hoje)).toBe(false);
    expect(deveAvisar({ ...base, tipo_aviso_tentativas: 3 }, hoje)).toBe(false);
    expect(deveAvisar({ ...base, tipos_cliente: { ativo: true, validade_dias: 30, aviso_dias: null } }, hoje)).toBe(false);
    expect(deveAvisar({ ...base, tipos_cliente: { ativo: false, validade_dias: 30, aviso_dias: 3 } }, hoje)).toBe(false);
    expect(deveAvisar({ ...base, active: false }, hoje)).toBe(false);
  });
});
