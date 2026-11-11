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
