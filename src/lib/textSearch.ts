// Busca que ignora acento e maiúscula: "oleo" encontra "Óleo", "jose" encontra "José".
export const normalizeSearch = (value: string | null | undefined): string =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

// Só letras e números: "20W-50" -> "20w50", "CG 160" -> "cg160".
const compact = (value: string): string => value.replace(/[^a-z0-9]/g, '');

// Busca por PALAVRAS, em qualquer ordem, sem acento/maiúscula: "oleo 20w50" encontra
// "Óleo lubrificante 20W-50". Cada palavra digitada tem que aparecer em algum dos campos
// (ignorando espaço, ponto e traço: "cg160" acha "CG 160"). Termo vazio casa tudo.
export const matchesSearch = (
  query: string | null | undefined,
  ...fields: Array<string | null | undefined>
): boolean => {
  const q = normalizeSearch(query);
  if (!q) return true;
  const texto = fields.map((f) => normalizeSearch(f)).join(' ');
  const textoCompacto = compact(texto);
  return q.split(/\s+/).every((palavra) => {
    if (texto.includes(palavra)) return true;
    const p = compact(palavra);
    return p.length > 0 && textoCompacto.includes(p);
  });
};

// Padrão regex (para o filtro `imatch` do Supabase/PostgREST) que casa o termo
// com ou sem acento: "oleo" -> "[oóòôõö]l[eéèêë][oóòôõö]" e encontra "Óleo" no banco.
// Qualquer caractere fora de letra/número/espaço vira "." (evita quebrar o filtro).
const ACCENT_CLASSES: Record<string, string> = {
  a: 'aáàâãäAÁÀÂÃÄ',
  e: 'eéèêëEÉÈÊË',
  i: 'iíìîïIÍÌÎÏ',
  o: 'oóòôõöOÓÒÔÕÖ',
  u: 'uúùûüUÚÙÛÜ',
  c: 'cçCÇ',
  n: 'nñNÑ',
};

export const accentPattern = (value: string | null | undefined): string =>
  Array.from(normalizeSearch(value))
    .map((ch) => (ACCENT_CLASSES[ch] ? `[${ACCENT_CLASSES[ch]}]` : /[a-z0-9 ]/.test(ch) ? ch : '.'))
    .join('');
