// O Supabase devolve no máximo 1000 linhas por consulta (mesmo pedindo .limit(5000)),
// e corta calado. Esta função busca de 1000 em 1000 até acabar.
// A consulta PRECISA ter uma ordem estável (ex.: .order('created_at').order('id')),
// senão uma linha pode cair em duas páginas ou em nenhuma.
const PASSO = 1000;

type Pagina<T> = PromiseLike<{ data: T[] | null; error: unknown }>;

export async function buscarTodas<T>(montar: (de: number, ate: number) => Pagina<T>, maximo = 200_000): Promise<T[]> {
  const tudo: T[] = [];
  for (let de = 0; de < maximo; de += PASSO) {
    const { data, error } = await montar(de, de + PASSO - 1);
    if (error) throw error;
    const pagina = data ?? [];
    tudo.push(...pagina);
    if (pagina.length < PASSO) break;
  }
  return tudo;
}
