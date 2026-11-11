// Busca que ignora acento e maiúscula: "oleo" encontra "Óleo", "jose" encontra "José".
export const normalizeSearch = (value: string | null | undefined): string =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

// true se algum dos campos contém o termo (sem acento/maiúscula). Termo vazio casa tudo.
export const matchesSearch = (
  query: string | null | undefined,
  ...fields: Array<string | null | undefined>
): boolean => {
  const q = normalizeSearch(query);
  if (!q) return true;
  return fields.some((f) => normalizeSearch(f).includes(q));
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
