// Caixa: um lançamento estornado e o estorno dele se anulam. Se os dois caem no mesmo período,
// nenhum dos dois conta em Entradas/Saídas (senão um valor digitado errado infla os totais).
// Se caem em períodos diferentes (entrou em outubro, estornou em novembro), cada um conta no seu.
// O saldo não muda; só para de inflar Entradas e Saídas. A lista continua mostrando os dois.

interface LinhaCaixa { id: string; estorno_de?: string | null }

export function semEstornosAnulados<T extends LinhaCaixa>(linhas: T[]): T[] {
  const ids = new Set(linhas.map((l) => l.id));
  const anulados = new Set<string>();
  for (const l of linhas) {
    if (l.estorno_de && ids.has(l.estorno_de)) {
      anulados.add(l.id);
      anulados.add(l.estorno_de);
    }
  }
  return anulados.size ? linhas.filter((l) => !anulados.has(l.id)) : linhas;
}
