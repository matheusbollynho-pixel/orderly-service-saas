import { describe, expect, it } from 'vitest';
import { situacaoFiado } from '@/lib/fiadoCliente';

describe('situação do fiado do cliente', () => {
  const fiados = [
    { original_amount: 300, interest_accrued: 6, amount_paid: 100, due_date: '2026-11-20', status: 'parcial' }, // atrasado 206
    { original_amount: 150, interest_accrued: 0, amount_paid: 0, due_date: '2026-12-10', status: 'pendente' },  // em dia 150
    { original_amount: 80, interest_accrued: 0, amount_paid: 80, due_date: '2026-10-01', status: 'pago' },      // quitado
  ];
  it('em aberto, atrasado e quanto ainda cabe no limite', () => {
    expect(situacaoFiado({ fiado_aprovado: true, fiado_limite: 500 }, fiados, '2026-11-28')).toEqual({
      aprovado: true, limite: 500, aberto: 356, atrasado: 206, qtdAtrasados: 1, disponivel: 144,
    });
  });
  it('sem limite = disponível nulo; passou do limite = 0; sem cliente = não aprovado', () => {
    expect(situacaoFiado({ fiado_aprovado: false, fiado_limite: null }, fiados, '2026-11-28').disponivel).toBeNull();
    expect(situacaoFiado({ fiado_aprovado: true, fiado_limite: 300 }, fiados, '2026-11-28').disponivel).toBe(0);
    expect(situacaoFiado(null, [], '2026-11-28')).toEqual({ aprovado: false, limite: null, aberto: 0, atrasado: 0, qtdAtrasados: 0, disponivel: null });
  });
});
