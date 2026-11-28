// Almoxarifado: de onde sai o item da OS e quanto de uma embalagem foi usado.

export type UsoProduto = 'venda' | 'interno' | 'ambos';
export type Origem = 'loja' | 'almox';

/** Padrão de onde sai na OS (loja com almoxarifado): "só venda" sai da loja; o resto, do almoxarifado (como era). */
export const origemPadrao = (uso: UsoProduto | string | null | undefined): Origem => (uso === 'venda' ? 'loja' : 'almox');

// Unidades que se convertem entre si (base = a menor)
const BASE: Record<string, { grupo: string; fator: number }> = {
  ml: { grupo: 'volume', fator: 1 }, l: { grupo: 'volume', fator: 1000 },
  g: { grupo: 'peso', fator: 1 }, kg: { grupo: 'peso', fator: 1000 },
  cm: { grupo: 'comprimento', fator: 1 }, m: { grupo: 'comprimento', fator: 100 },
  un: { grupo: 'unidade', fator: 1 },
};

/** Unidades que dá para digitar o uso de uma embalagem com conteúdo nessa unidade (ex.: lata em ml → ml ou l). */
export function unidadesDoConteudo(conteudoUnidade: string | null | undefined): string[] {
  const g = BASE[(conteudoUnidade || '').toLowerCase()]?.grupo;
  return g ? Object.keys(BASE).filter((u) => BASE[u].grupo === g) : [];
}

/**
 * Quanto de 1 embalagem foi usado. Ex.: usou 50 ml de uma lata de 300 ml → 0,167.
 * Devolve null se as unidades não combinam ou os números não fazem sentido.
 */
export function fracaoDaEmbalagem(usado: number, unidadeUsada: string, conteudoQtd: number, conteudoUnidade: string): number | null {
  const a = BASE[unidadeUsada.toLowerCase()], b = BASE[conteudoUnidade.toLowerCase()];
  if (!a || !b || a.grupo !== b.grupo || !(usado > 0) || !(conteudoQtd > 0)) return null;
  return (usado * a.fator) / (conteudoQtd * b.fator);
}

/** Quantidade gravada no estoque (3 casas, como o banco guarda). */
export const qtdEstoque = (v: number) => Number(v.toFixed(3));

/** Texto curto para a descrição do item: ¼, ½, ¾ ou "0,3". */
export function textoParte(f: number): string {
  const nomes: Record<string, string> = { '0.25': '¼', '0.5': '½', '0.75': '¾' };
  return nomes[String(f)] ?? String(qtdEstoque(f)).replace('.', ',');
}
