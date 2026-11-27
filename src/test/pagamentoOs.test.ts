import { describe, expect, it } from 'vitest';
import { conferirPagamento, textoConferencia } from '../lib/pagamentoOs';

describe('Pagamento da OS: valor recebido + desconto', () => {
  it('caso Noelia certo: R$100 recebido + R$3 de desconto quita R$103 que faltava', () => {
    const c = conferirPagamento(100, 3, 103);
    expect(c).toEqual({ noCaixa: 100, quita: 103, passou: false, sugestao: null });
    expect(textoConferencia(c, 3, 103)).toMatch(/Entra no caixa: R\$\s?100,00.*quita R\$\s?103,00 de R\$\s?103,00/);
  });
  it('hábito do total cheio: digitou R$103 (o que faltava) + R$3 de desconto → avisa e sugere R$100', () => {
    const c = conferirPagamento(103, 3, 103);
    expect(c.passou).toBe(true);
    expect(c.sugestao).toBe(100);
  });
  it('pagamento parcial sem desconto não avisa', () => {
    expect(conferirPagamento(90, 0, 193)).toMatchObject({ noCaixa: 90, passou: false });
  });
  it('passou do que falta sem desconto: avisa, sem sugestão', () => {
    expect(conferirPagamento(250, 0, 204)).toMatchObject({ passou: true, sugestao: null });
  });
});
