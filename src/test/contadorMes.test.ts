import { describe, expect, it } from 'vitest';
import { limitesDoMes, mesAnterior } from '@/pages/ContadorPage';

describe('área do contador: meses', () => {
  it('limites do mês com 31, 30 e fevereiro (bissexto e não)', () => {
    expect(limitesDoMes('2026-10')).toEqual({ de: '2026-10-01', ate: '2026-10-31' });
    expect(limitesDoMes('2026-11')).toEqual({ de: '2026-11-01', ate: '2026-11-30' });
    expect(limitesDoMes('2026-02')).toEqual({ de: '2026-02-01', ate: '2026-02-28' });
    expect(limitesDoMes('2028-02')).toEqual({ de: '2028-02-01', ate: '2028-02-29' });
  });
  it('mês anterior pelo horário de Brasília, com virada de ano', () => {
    expect(mesAnterior(new Date('2026-11-27T15:00:00Z'))).toBe('2026-10');
    expect(mesAnterior(new Date('2027-01-10T15:00:00Z'))).toBe('2026-12');
    // 01/12 às 01h UTC ainda é 30/11 em Brasília → mês anterior = outubro
    expect(mesAnterior(new Date('2026-12-01T01:00:00Z'))).toBe('2026-10');
  });
});
