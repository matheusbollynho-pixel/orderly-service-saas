// v2: período único dos Relatórios (e depois do Caixa).
// Dia / Semana (termina no dia do acerto da loja; padrão sábado) / Mês / Escolher datas.
// Se o período inclui hoje, vai só até hoje e compara com o MESMO PEDAÇO do período anterior
// (1–13/nov x 1–13/out), pra começo de mês não parecer prejuízo.

export type ModoPeriodo = 'dia' | 'semana' | 'mes' | 'livre';
export interface Periodo { ini: string; fim: string } // yyyy-mm-dd

const pad = (n: number) => String(n).padStart(2, '0');
export const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const deIso = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const somaDias = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const ultimoDiaDoMes = (ano: number, mes: number) => new Date(ano, mes + 1, 0).getDate();
const diasEntre = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86_400_000);

/** Período cheio que contém `ref`. diaAcerto: 0=domingo … 6=sábado (fim da semana). */
export function periodoCheio(modo: Exclude<ModoPeriodo, 'livre'>, ref: Date, diaAcerto = 6): Periodo {
  if (modo === 'dia') return { ini: iso(ref), fim: iso(ref) };
  if (modo === 'mes') {
    return { ini: iso(new Date(ref.getFullYear(), ref.getMonth(), 1)), fim: iso(new Date(ref.getFullYear(), ref.getMonth(), ultimoDiaDoMes(ref.getFullYear(), ref.getMonth()))) };
  }
  // semana: termina no dia do acerto
  const ateFim = (diaAcerto - ref.getDay() + 7) % 7;
  const fim = somaDias(ref, ateFim);
  return { ini: iso(somaDias(fim, -6)), fim: iso(fim) };
}

/** O que mostrar: o período cheio, mas cortado em hoje se ainda está em andamento. */
export function periodoAte(modo: Exclude<ModoPeriodo, 'livre'>, ref: Date, hoje: Date, diaAcerto = 6): Periodo {
  const p = periodoCheio(modo, ref, diaAcerto);
  const h = iso(hoje);
  return p.ini <= h && h < p.fim ? { ini: p.ini, fim: h } : p;
}

/** Período anterior pra comparar (mesmo pedaço). */
export function periodoAnterior(modo: ModoPeriodo, p: Periodo): Periodo {
  const ini = deIso(p.ini), fim = deIso(p.fim);
  if (modo === 'dia') return { ini: iso(somaDias(ini, -1)), fim: iso(somaDias(fim, -1)) };
  if (modo === 'semana') return { ini: iso(somaDias(ini, -7)), fim: iso(somaDias(fim, -7)) };
  if (modo === 'mes') {
    const a = ini.getFullYear(), m = ini.getMonth() - 1;
    const iniAnt = new Date(a, m, 1);
    const ultimo = ultimoDiaDoMes(iniAnt.getFullYear(), iniAnt.getMonth());
    const cheio = fim.getDate() === ultimoDiaDoMes(fim.getFullYear(), fim.getMonth());
    const diaFim = cheio ? ultimo : Math.min(fim.getDate(), ultimo);
    return { ini: iso(iniAnt), fim: iso(new Date(iniAnt.getFullYear(), iniAnt.getMonth(), diaFim)) };
  }
  // livre: mesmo número de dias, logo antes
  const n = diasEntre(ini, fim);
  const fimAnt = somaDias(ini, -1);
  return { ini: iso(somaDias(fimAnt, -n)), fim: iso(fimAnt) };
}

/** Anda pra trás/frente uma unidade (‹ ›). */
export function andar(modo: Exclude<ModoPeriodo, 'livre'>, ref: Date, passos: number): Date {
  if (modo === 'dia') return somaDias(ref, passos);
  if (modo === 'semana') return somaDias(ref, 7 * passos);
  return new Date(ref.getFullYear(), ref.getMonth() + passos, 1);
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
/** "1–13/nov", "28/out–3/nov", "13/nov". */
export function rotuloPeriodo(p: Periodo): string {
  const a = deIso(p.ini), b = deIso(p.fim);
  if (p.ini === p.fim) return `${a.getDate()}/${MESES[a.getMonth()]}`;
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) return `${a.getDate()}–${b.getDate()}/${MESES[b.getMonth()]}`;
  return `${a.getDate()}/${MESES[a.getMonth()]}–${b.getDate()}/${MESES[b.getMonth()]}`;
}

/** Máximo de dias num período (o banco também confere). */
export const MAX_DIAS_PERIODO = 1100;
/** Período "Escolher" válido pra pedir ao banco? Senão devolve o motivo. */
export function problemaNoPeriodo(p: Periodo): string | null {
  const ok = (x: string) => /^\d{4}-\d{2}-\d{2}$/.test(x) && Number(x.slice(0, 4)) >= 2000;
  if (!ok(p.ini) || !ok(p.fim)) return 'Escolha as duas datas.';
  if (p.fim < p.ini) return 'A data final está antes da inicial.';
  if (diasEntre(deIso(p.ini), deIso(p.fim)) > MAX_DIAS_PERIODO) return 'Escolha no máximo 3 anos.';
  return null;
}
