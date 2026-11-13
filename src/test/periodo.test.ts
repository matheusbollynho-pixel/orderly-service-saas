import { describe, expect, it } from 'vitest';
import { andar, deIso, periodoAnterior, periodoAte, periodoCheio, rotuloPeriodo } from '@/lib/periodo';

const d = (s: string) => deIso(s);

describe('periodo', () => {
  it('semana termina no sábado (domingo a sábado)', () => {
    // 13/11/2026 é sexta
    expect(periodoCheio('semana', d('2026-11-13'))).toEqual({ ini: '2026-11-08', fim: '2026-11-14' });
    // no próprio sábado
    expect(periodoCheio('semana', d('2026-11-14'))).toEqual({ ini: '2026-11-08', fim: '2026-11-14' });
    // domingo começa semana nova
    expect(periodoCheio('semana', d('2026-11-15'))).toEqual({ ini: '2026-11-15', fim: '2026-11-21' });
  });
  it('loja que paga na sexta: semana de sábado a sexta', () => {
    expect(periodoCheio('semana', d('2026-11-13'), 5)).toEqual({ ini: '2026-11-07', fim: '2026-11-13' });
    expect(periodoCheio('semana', d('2026-11-14'), 5)).toEqual({ ini: '2026-11-14', fim: '2026-11-20' });
  });
  it('período em andamento vai só até hoje', () => {
    expect(periodoAte('mes', d('2026-11-13'), d('2026-11-13'))).toEqual({ ini: '2026-11-01', fim: '2026-11-13' });
    expect(periodoAte('mes', d('2026-10-05'), d('2026-11-13'))).toEqual({ ini: '2026-10-01', fim: '2026-10-31' });
  });
  it('mês compara com o mesmo pedaço do mês anterior', () => {
    expect(periodoAnterior('mes', { ini: '2026-11-01', fim: '2026-11-13' })).toEqual({ ini: '2026-10-01', fim: '2026-10-13' });
    // mês cheio x mês cheio
    expect(periodoAnterior('mes', { ini: '2026-10-01', fim: '2026-10-31' })).toEqual({ ini: '2026-09-01', fim: '2026-09-30' });
    // 1–31/mar compara com fevereiro inteiro
    expect(periodoAnterior('mes', { ini: '2027-03-01', fim: '2027-03-31' })).toEqual({ ini: '2027-02-01', fim: '2027-02-28' });
    // 1–30/mar (em andamento) compara com fevereiro até o último dia
    expect(periodoAnterior('mes', { ini: '2027-03-01', fim: '2027-03-30' })).toEqual({ ini: '2027-02-01', fim: '2027-02-28' });
    // janeiro compara com dezembro do ano anterior
    expect(periodoAnterior('mes', { ini: '2027-01-01', fim: '2027-01-10' })).toEqual({ ini: '2026-12-01', fim: '2026-12-10' });
  });
  it('semana, dia e livre comparam com o bloco logo antes', () => {
    expect(periodoAnterior('semana', { ini: '2026-11-08', fim: '2026-11-13' })).toEqual({ ini: '2026-11-01', fim: '2026-11-06' });
    expect(periodoAnterior('dia', { ini: '2026-11-13', fim: '2026-11-13' })).toEqual({ ini: '2026-11-12', fim: '2026-11-12' });
    expect(periodoAnterior('livre', { ini: '2026-11-10', fim: '2026-11-12' })).toEqual({ ini: '2026-11-07', fim: '2026-11-09' });
  });
  it('andar e rótulo', () => {
    expect(andar('mes', d('2026-11-13'), -1).getMonth()).toBe(9);
    expect(rotuloPeriodo({ ini: '2026-11-01', fim: '2026-11-13' })).toBe('1–13/nov');
    expect(rotuloPeriodo({ ini: '2026-10-28', fim: '2026-11-03' })).toBe('28/out–3/nov');
    expect(rotuloPeriodo({ ini: '2026-11-13', fim: '2026-11-13' })).toBe('13/nov');
  });
});
