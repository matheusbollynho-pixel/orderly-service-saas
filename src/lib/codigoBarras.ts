// Leitor de código de barras: ele "digita" o código e aperta Enter. Se o texto bate exatamente
// com o código de barras (ou o código interno) de um produto, esse produto entra direto na venda.

type ComCodigo = { barcode?: string | null; code?: string | null };

const limpo = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

/** Produto cujo código de barras ou código interno é exatamente o texto lido (código de barras tem prioridade). */
export function produtoPeloCodigo<T extends ComCodigo>(produtos: T[], texto: string): T | null {
  const t = limpo(texto);
  if (t.length < 3 || /\s/.test(t)) return null; // nome digitado (com espaço) não é código
  return produtos.find((p) => limpo(p.barcode) === t)
    ?? produtos.find((p) => limpo(p.code) === t)
    ?? null;
}
