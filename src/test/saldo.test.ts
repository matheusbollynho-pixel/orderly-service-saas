import { describe, it, expect } from 'vitest';
import { saldoOS, saldoFiado } from '@/lib/saldoOS';

describe('saldoOS', () => {
  it('soma peças × quantidade e desconta pagamentos e descontos', () => {
    const r = saldoOS({
      materials: [{ valor: 50, quantidade: '2' }, { valor: 80, quantidade: '1' }],
      payments: [{ amount: 100, discount_amount: 10 }],
    });
    expect(r.total).toBe(180);
    expect(r.falta).toBe(70);
  });
  it('quitada ou paga a mais fica zero; sem peças fica zero', () => {
    expect(saldoOS({ materials: [{ valor: 30, quantidade: '1' }], payments: [{ amount: 50 }] }).falta).toBe(0);
    expect(saldoOS({}).falta).toBe(0);
  });
  it('quantidade com vírgula/texto vazio não quebra', () => {
    expect(saldoOS({ materials: [{ valor: 10, quantidade: '' }] }).total).toBe(0);
  });
});

describe('saldoFiado', () => {
  it('valor + juros − pago', () => {
    expect(saldoFiado({ original_amount: 400, interest_accrued: 8, amount_paid: 200 })).toBe(208);
    expect(saldoFiado({ original_amount: 56.9, amount_paid: 146 })).toBe(0);
  });
});
