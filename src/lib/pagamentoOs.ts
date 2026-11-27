// Pagamento da OS: o "valor" é o que o cliente PAGOU (entra no caixa); o desconto é à parte.
// recebido + desconto = quanto da OS fica quitado. Hábito comum: digitar o total cheio E o desconto
// (aí o desconto conta duas vezes). Esta conta avisa antes de salvar.

const r2 = (v: number) => Math.round(v * 100) / 100;

export interface ConferenciaPagamento {
  /** entra no caixa */
  noCaixa: number;
  /** quanto da OS esse pagamento quita (recebido + desconto) */
  quita: number;
  /** passou do que faltava? */
  passou: boolean;
  /** se passou e parece "total cheio + desconto": o valor que o cliente pagou de verdade */
  sugestao: number | null;
}

export function conferirPagamento(valor: number, desconto: number, falta: number): ConferenciaPagamento {
  const v = r2(Math.max(valor || 0, 0));
  const d = r2(Math.max(desconto || 0, 0));
  const f = r2(Math.max(falta || 0, 0));
  const quita = r2(v + d);
  const passou = quita > f + 0.009;
  // Digitou o que faltava inteiro e ainda pôs desconto → o cliente pagou "falta − desconto"
  const sugestao = passou && d > 0 && f > d && Math.abs(v - f) < 0.01 ? r2(f - d) : null;
  return { noCaixa: v, quita, passou, sugestao };
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Linha curta para mostrar embaixo do formulário */
export function textoConferencia(c: ConferenciaPagamento, desconto: number, falta: number): string {
  if (!c.noCaixa) return '';
  const base = desconto > 0
    ? `Entra no caixa: ${brl(c.noCaixa)} · com o desconto de ${brl(desconto)}, quita ${brl(c.quita)} de ${brl(falta)}`
    : `Entra no caixa: ${brl(c.noCaixa)} de ${brl(falta)} que falta`;
  return base;
}
