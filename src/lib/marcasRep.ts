// Marcas por representante: quem recebe o pedido de preço de cada peça.
import { normalizeSearch } from '@/lib/textSearch';

export const normMarca = (m: string | null | undefined) => normalizeSearch(String(m ?? '')).replace(/\s+/g, ' ').trim();

/** "Vonnixx, AGT ,  vonnixx" → ["Vonnixx", "AGT"] (sem repetir) */
export function lerMarcas(texto: string): string[] {
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const m of texto.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean)) {
    const k = normMarca(m);
    if (!vistos.has(k)) { vistos.add(k); out.push(m); }
  }
  return out;
}

/** O representante trabalha com essa marca? Sem marcas cadastradas = vende de tudo; peça sem marca = qualquer um. */
export function repAtende(marcasRep: string[] | null | undefined, marcaPeca: string | null | undefined): boolean {
  if (!marcasRep || marcasRep.length === 0) return true;
  const m = normMarca(marcaPeca);
  if (!m) return true;
  return marcasRep.some((x) => normMarca(x) === m);
}
